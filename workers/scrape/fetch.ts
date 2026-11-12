// 取得と robots.txt 判定

export const USER_AGENT = "HitokuchiBot/1.0 (+new product catalog; respects robots.txt)";

export type FetchResult = { body: string; url: string; etag: string | null; lastModified: string | null; notModified: boolean };

/**
 * 取得（<meta http-equiv="Refresh"> によるリダイレクトも 1 回だけ追う）。
 * etag / lastModified を渡すと条件付きリクエストになり、変化が無ければ notModified: true（本文なし）を返す。
 */
export async function politeFetch(url: string, opts: { etag?: string | null; lastModified?: string | null } = {}, depth = 0): Promise<FetchResult> {
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8" };
  if (depth === 0 && opts.etag) headers["if-none-match"] = opts.etag;
  if (depth === 0 && opts.lastModified) headers["if-modified-since"] = opts.lastModified;
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (res.status === 304) return { body: "", url: res.url || url, etag: opts.etag ?? null, lastModified: opts.lastModified ?? null, notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml|json|text/.test(type)) throw new Error(`unsupported content-type ${type}`);
  const body = (await res.text()).slice(0, 3_000_000);
  const refresh = body.length < 2000 && body.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i)?.[1];
  if (refresh && depth < 1) return politeFetch(new URL(refresh.trim(), res.url || url).href, {}, depth + 1);
  return { body, url: res.url || url, etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), notModified: false };
}

/** 一覧に載っている商品コードの集合から作るハッシュ（並び順や広告・日付表示の変化には反応しない） */
export async function listHash(ids: string[]) {
  const data = new TextEncoder().encode([...new Set(ids)].sort().join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** robots.txt の User-agent: * の Disallow を簡易判定 */
export async function isAllowedByRobots(url: string) {
  const u = new URL(url);
  try {
    const res = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return true;
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
    let applies = false;
    const disallow: string[] = [];
    const allow: string[] = [];
    for (const line of lines) {
      const [k, ...rest] = line.split(":");
      const key = k?.trim().toLowerCase();
      const val = rest.join(":").trim();
      if (key === "user-agent") applies = val === "*" || USER_AGENT.toLowerCase().startsWith(val.toLowerCase());
      else if (applies && key === "disallow" && val) disallow.push(val);
      else if (applies && key === "allow" && val) allow.push(val);
    }
    const path = u.pathname + u.search;
    const longest = (list: string[]) => Math.max(-1, ...list.filter((p) => path.startsWith(p.replace(/\*.*$/, ""))).map((p) => p.length));
    return longest(allow) >= longest(disallow);
  } catch {
    return true;
  }
}
