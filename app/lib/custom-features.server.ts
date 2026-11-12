import type { ProductRow } from "./db.server";

export type CustomFeature = { id: number; slug: string; title: string; lead: string; emoji: string; theme: string; status: "draft" | "published"; updated_at: string; item_count?: number };

const PRODUCT_COLS = `p.id, p.name, m.name AS maker, c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji,
  p.price, p.kcal, p.description, p.image_key, p.image_url, p.region, p.accent, p.released_on, p.rating_avg, p.review_count,
  p.status, p.source_url, p.jan`;

export async function listCustomFeatures(db: D1Database, publishedOnly: boolean) {
  const { results } = await db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM feature_items i JOIN products p ON p.id = i.product_id WHERE i.feature_id = f.id AND p.status = 'published') AS item_count
       FROM features f ${publishedOnly ? "WHERE f.status = 'published'" : ""} ORDER BY f.updated_at DESC`,
    )
    .all<CustomFeature>();
  return results;
}

export async function getCustomFeature(db: D1Database, by: { id?: number; slug?: string }) {
  const f = by.id != null
    ? await db.prepare("SELECT * FROM features WHERE id = ?").bind(by.id).first<CustomFeature>()
    : await db.prepare("SELECT * FROM features WHERE slug = ?").bind(by.slug ?? "").first<CustomFeature>();
  if (!f) return null;
  const { results } = await db
    .prepare(
      `SELECT ${PRODUCT_COLS} FROM feature_items i JOIN products p ON p.id = i.product_id
       LEFT JOIN makers m ON m.id = p.maker_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE i.feature_id = ? AND p.status = 'published' ORDER BY i.position`,
    )
    .bind(f.id)
    .all<ProductRow>();
  return { feature: f, items: results };
}

export async function featureThumbs(db: D1Database, featureId: number) {
  const { results } = await db
    .prepare("SELECT p.image_url FROM feature_items i JOIN products p ON p.id = i.product_id WHERE i.feature_id = ? AND p.image_url IS NOT NULL ORDER BY i.position LIMIT 4")
    .bind(featureId)
    .all<{ image_url: string }>();
  return results.map((r) => r.image_url);
}
