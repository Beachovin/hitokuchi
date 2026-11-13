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

export type RobotsRules = { allow: string[]; disallow: string[] };

/**
 * robots.txt を取得して、自分（User-agent: * または HitokuchiBot）に当てはまる Allow / Disallow を返す。
 * 取得できない・存在しないときは「制限なし」。同じサイトでは 1 回だけ取得して使い回す（外部リクエストを節約）。
 */
export async function fetchRobots(origin: string): Promise<RobotsRules> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { allow: [], disallow: [] };
    return parseRobots(await res.text());
  } catch {
    return { allow: [], disallow: [] };
  }
}

export function parseRobots(body: string): RobotsRules {
  const lines = body.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
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
  return { allow, disallow };
}

/** 取得済みのルールで、その URL を取得してよいかを判定（より長く一致した指定が優先） */
export function robotsAllows(rules: RobotsRules, url: string) {
  const u = new URL(url);
  const path = u.pathname + u.search;
  const longest = (list: string[]) => Math.max(-1, ...list.filter((p) => path.startsWith(p.replace(/\*.*$/, ""))).map((p) => p.length));
  return longest(rules.allow) >= longest(rules.disallow);
}

/** robots.txt を取得して判定（1 回だけ確認したいとき用） */
export async function isAllowedByRobots(url: string) {
  return robotsAllows(await fetchRobots(new URL(url).origin), url);
}
