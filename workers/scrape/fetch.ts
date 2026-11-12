// 取得と robots.txt 判定

export const USER_AGENT = "HitokuchiBot/1.0 (+new product catalog; respects robots.txt)";

/** 取得（<meta http-equiv="Refresh"> によるリダイレクトも 1 回だけ追う） */
export async function politeFetch(url: string, depth = 0): Promise<{ body: string; url: string }> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml|json|text/.test(type)) throw new Error(`unsupported content-type ${type}`);
  const body = (await res.text()).slice(0, 3_000_000);
  const refresh = body.length < 2000 && body.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i)?.[1];
  if (refresh && depth < 1) return politeFetch(new URL(refresh.trim(), res.url).href, depth + 1);
  return { body, url: res.url };
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
