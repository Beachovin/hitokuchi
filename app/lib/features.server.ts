import type { ProductRow } from "./db.server";
import { AREAS, limitedAreas } from "./features";
import { addDays, todayJst } from "./weeks";

const SELECT = `SELECT p.id, p.name, m.name AS maker, c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji,
  p.price, p.kcal, p.description, p.image_key, p.image_url, p.region, p.accent, p.released_on, p.rating_avg, p.review_count,
  p.status, p.source_url, p.jan
  FROM products p LEFT JOIN makers m ON m.id = p.maker_id LEFT JOIN categories c ON c.id = p.category_id`;

/** 直近 90 日（＋発売予定）の公開商品 */
async function recentProducts(db: D1Database) {
  const today = todayJst();
  const { results } = await db
    .prepare(`${SELECT} WHERE p.status = 'published' AND p.released_on BETWEEN ? AND ? ORDER BY p.released_on DESC, p.rating_avg DESC LIMIT 2000`)
    .bind(addDays(today, -90), addDays(today, 30))
    .all<ProductRow>();
  return results;
}

export async function regionProducts(db: D1Database, slug: string) {
  return (await recentProducts(db)).filter((p) => limitedAreas(p.region).includes(slug));
}

/** 特集トップ用の件数とサムネイル */
export async function featureOverview(db: D1Database) {
  const all = await recentProducts(db);
  const regions = AREAS.map((a) => {
    const items = all.filter((p) => limitedAreas(p.region).includes(a.slug));
    return { slug: a.slug, name: a.name, emoji: a.emoji, count: items.length, thumbs: items.filter((p) => p.image_url).slice(0, 3).map((p) => p.image_url!) };
  });
  return { regions };
}
