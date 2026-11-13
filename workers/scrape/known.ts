// 収集した商品コードのうち、すでに取り込んだことがあるもの（候補として保存済み、または削除済みで記録が残っているもの）

/** D1 は 1 つの SQL に渡せる値が 100 個まで。下の SQL は同じ値を 2 回使うので、45 個ずつに分ける */
const CHUNK = 45;

export async function knownKeys(DB: D1Database, keys: string[]) {
  const known = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const ph = chunk.map(() => "?").join(",");
    stmts.push(
      DB.prepare(`SELECT external_key FROM product_candidates WHERE external_key IN (${ph}) UNION SELECT external_key FROM scrape_seen WHERE external_key IN (${ph})`).bind(...chunk, ...chunk),
    );
  }
  if (!stmts.length) return known;
  for (const r of await DB.batch<{ external_key: string }>(stmts)) r.results.forEach((x) => known.add(x.external_key));
  return known;
}
