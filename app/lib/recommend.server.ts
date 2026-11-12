import type { ProductRow } from "./db.server";
import { addDays, todayJst } from "./weeks";

/**
 * あなたへのおすすめ：「気になる」と高評価（★4以上）の口コミからカテゴリ・チェーンの好みを推定し、
 * 最近発売（または発売予定）の商品から、まだ登録・口コミしていないものを選ぶ。
 */
export async function recommendFor(db: D1Database, userId: string, limit = 8) {
  const today = todayJst();
  const { results } = await db
    .prepare(
      `WITH pref AS (
         SELECT p.category_id, p.maker_id, w FROM (
           SELECT product_id, 2 AS w FROM bookmarks WHERE user_id = ?1
           UNION ALL SELECT product_id, 3 FROM reviews WHERE reviewer_id = ?1 AND rating >= 4
           UNION ALL SELECT product_id, 1 FROM eaten WHERE user_id = ?1
         ) t JOIN products p ON p.id = t.product_id
       ),
       cat AS (SELECT category_id, SUM(w) AS s FROM pref GROUP BY category_id),
       mk AS (SELECT maker_id, SUM(w) AS s FROM pref GROUP BY maker_id)
       SELECT p.id, p.name, m.name AS maker, c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji,
              p.price, p.kcal, p.description, p.image_key, p.image_url, p.region, p.accent, p.released_on, p.rating_avg, p.review_count,
              p.status, p.source_url, p.jan,
              COALESCE(cat.s, 0) * 2 + COALESCE(mk.s, 0) + p.rating_avg AS score
       FROM products p
       LEFT JOIN makers m ON m.id = p.maker_id LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN cat ON cat.category_id = p.category_id LEFT JOIN mk ON mk.maker_id = p.maker_id
       WHERE p.status = 'published' AND p.released_on BETWEEN ?2 AND ?3
         AND p.id NOT IN (SELECT product_id FROM bookmarks WHERE user_id = ?1)
         AND p.id NOT IN (SELECT product_id FROM reviews WHERE reviewer_id = ?1)
         AND p.id NOT IN (SELECT product_id FROM eaten WHERE user_id = ?1)
       ORDER BY score DESC, p.released_on DESC, p.id DESC
       LIMIT ?4`,
    )
    .bind(userId, addDays(today, -14), addDays(today, 7), limit)
    .all<ProductRow & { score: number }>();
  const personalized = results.some((r) => r.score > r.rating_avg);
  return { items: results, personalized };
}
