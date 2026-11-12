// D1 へのクエリをまとめたモジュール（サーバー専用）

export type ProductRow = {
  id: number;
  name: string;
  maker: string | null;
  category: string | null;
  category_slug: string | null;
  category_emoji: string | null;
  price: number | null;
  kcal: number | null;
  description: string | null;
  image_key: string | null;
  image_url: string | null;
  region: string | null;
  ai_summary?: string | null;
  ai_summary_count?: number;
  accent: string;
  released_on: string | null;
  rating_avg: number;
  review_count: number;
  status: string;
  source_url: string | null;
  jan: string | null;
};

export type ReviewRow = {
  id: number;
  product_id: number;
  nickname: string;
  rating: number;
  taste: number | null;
  volume: number | null;
  value: number | null;
  title: string | null;
  body: string;
  image_key: string | null;
  helpful_count: number;
  good_count: number;
  bad_count: number;
  is_first: number;
  is_quick: number;
  reviewer_id: string | null;
  status: string;
  created_at: string;
  // レビュアー集計（JOIN）
  r_review_count: number | null;
  r_good_received: number | null;
  r_bad_received: number | null;
  r_first_count: number | null;
  // レビュアーの公開プロフィール（JOIN・非公開設定の項目は NULL）
  u_avatar_key: string | null;
  u_age_group: string | null;
  u_gender: string | null;
  u_is_demo: number | null;
};

export const reviewerStatsOf = (r: Pick<ReviewRow, "r_review_count" | "r_good_received" | "r_bad_received" | "r_first_count">) =>
  r.r_review_count == null
    ? null
    : { review_count: r.r_review_count, good_received: r.r_good_received ?? 0, bad_received: r.r_bad_received ?? 0, first_count: r.r_first_count ?? 0 };

const REVIEWER_JOIN = `LEFT JOIN reviewers rv ON rv.id = r.reviewer_id LEFT JOIN users u ON u.id = r.reviewer_id`;
const REVIEWER_COLS = `rv.review_count AS r_review_count, rv.good_received AS r_good_received, rv.bad_received AS r_bad_received, rv.first_count AS r_first_count,
  u.avatar_key AS u_avatar_key,
  CASE WHEN u.show_age = 1 THEN u.age_group END AS u_age_group,
  CASE WHEN u.show_gender = 1 THEN u.gender END AS u_gender,
  u.is_demo AS u_is_demo`;

/** 口コミ行からレビュアー情報を取り出し、クライアントに渡してよい形にする（reviewer_id は含めない） */
export function publicReview<T extends ReviewRow>(row: T, viewerId: string | null) {
  const { reviewer_id, r_review_count, r_good_received, r_bad_received, r_first_count, u_avatar_key, u_age_group, u_gender, u_is_demo, ...rest } = row;
  return {
    ...rest,
    isMine: !!viewerId && reviewer_id === viewerId,
    reviewer: reviewerStatsOf({ r_review_count, r_good_received, r_bad_received, r_first_count }),
    author: {
      avatarUrl: u_avatar_key ? `/img/${encodeURIComponent(u_avatar_key)}` : null,
      ageGroup: u_age_group,
      gender: u_gender,
      isDemo: !!u_is_demo,
    },
  };
}

export type Category = { id: number; slug: string; name: string; emoji: string };
export type Channel = { id: number; slug: string; name: string };

const PRODUCT_SELECT = `
  SELECT p.id, p.name, m.name AS maker, c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji,
         p.price, p.kcal, p.description, p.image_key, p.image_url, p.region, p.accent, p.released_on, p.rating_avg, p.review_count,
         p.status, p.source_url, p.jan
  FROM products p
  LEFT JOIN makers m ON m.id = p.maker_id
  LEFT JOIN categories c ON c.id = p.category_id`;

export type ProductQuery = {
  q?: string;
  category?: string;
  channel?: string;
  sort?: "new" | "rating" | "reviews" | "price_asc";
  limit?: number;
  offset?: number;
  includeHidden?: boolean;
};

export async function listProducts(db: D1Database, opts: ProductQuery = {}) {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (!opts.includeHidden) where.push("p.status = 'published'");
  if (opts.category) {
    where.push("c.slug = ?");
    binds.push(opts.category);
  }
  if (opts.channel) {
    where.push("EXISTS (SELECT 1 FROM product_channels pc JOIN channels ch ON ch.id = pc.channel_id WHERE pc.product_id = p.id AND ch.slug = ?)");
    binds.push(opts.channel);
  }
  const q = opts.q?.trim();
  if (q) {
    // trigram FTS は 3 文字以上。短い語は LIKE にフォールバック
    if ([...q].length >= 3) {
      where.push("p.id IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)");
      binds.push(`"${q.replaceAll('"', '""')}"`);
    } else {
      where.push("(p.name LIKE ? OR m.name LIKE ?)");
      binds.push(`%${q}%`, `%${q}%`);
    }
  }
  const order = {
    new: "p.released_on DESC, p.id DESC",
    rating: "p.rating_avg DESC, p.review_count DESC",
    reviews: "p.review_count DESC, p.rating_avg DESC",
    price_asc: "p.price ASC",
  }[opts.sort ?? "new"];
  const sql = `${PRODUCT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...binds, opts.limit ?? 24, opts.offset ?? 0)
    .all<ProductRow>();
  return results;
}

export async function getProduct(db: D1Database, id: number, includeHidden = false) {
  return db
    .prepare(`${PRODUCT_SELECT.replace("p.jan", "p.jan, p.ai_summary, p.ai_summary_count")} WHERE p.id = ? ${includeHidden ? "" : "AND p.status = 'published'"}`)
    .bind(id)
    .first<ProductRow>();
}

export async function getProductChannels(db: D1Database, id: number) {
  const { results } = await db
    .prepare("SELECT ch.* FROM channels ch JOIN product_channels pc ON pc.channel_id = ch.id WHERE pc.product_id = ?")
    .bind(id)
    .all<Channel>();
  return results;
}

export async function listReviews(db: D1Database, productId: number, sort: "new" | "helpful" = "new") {
  const order = sort === "helpful" ? "(r.good_count - r.bad_count) DESC, r.created_at DESC" : "r.created_at DESC";
  const { results } = await db
    .prepare(`SELECT r.*, ${REVIEWER_COLS} FROM reviews r ${REVIEWER_JOIN} WHERE r.product_id = ? AND r.status = 'published' ORDER BY ${order} LIMIT 50`)
    .bind(productId)
    .all<ReviewRow>();
  return results;
}

export async function reviewStats(db: D1Database, productId: number) {
  const { results } = await db
    .prepare("SELECT rating, COUNT(*) AS n FROM reviews WHERE product_id = ? AND status = 'published' GROUP BY rating")
    .bind(productId)
    .all<{ rating: number; n: number }>();
  const dist = [5, 4, 3, 2, 1].map((r) => ({ rating: r, n: results.find((x) => x.rating === r)?.n ?? 0 }));
  const axes = await db
    .prepare("SELECT AVG(taste) AS taste, AVG(volume) AS volume, AVG(value) AS value FROM reviews WHERE product_id = ? AND status = 'published'")
    .bind(productId)
    .first<{ taste: number | null; volume: number | null; value: number | null }>();
  return { dist, axes };
}

export async function recalcProductRating(db: D1Database, productId: number) {
  await db
    .prepare(
      `UPDATE products SET
         review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ?1 AND status = 'published'),
         rating_avg = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews WHERE product_id = ?1 AND status = 'published'), 0),
         updated_at = datetime('now')
       WHERE id = ?1`,
    )
    .bind(productId)
    .run();
}

export async function listCategories(db: D1Database) {
  const { results } = await db.prepare("SELECT id, slug, name, emoji FROM categories ORDER BY sort").all<Category>();
  return results;
}

export async function listChannels(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM channels ORDER BY id").all<Channel>();
  return results;
}

export async function latestReviews(db: D1Database, limit = 6) {
  const { results } = await db
    .prepare(
      `SELECT r.*, p.name AS product_name, p.accent, p.image_url AS product_image_url, c.emoji AS category_emoji, ${REVIEWER_COLS}
       FROM reviews r JOIN products p ON p.id = r.product_id LEFT JOIN categories c ON c.id = p.category_id ${REVIEWER_JOIN}
       WHERE r.status = 'published' AND p.status = 'published'
       ORDER BY r.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<ReviewRow & { product_name: string; accent: string; product_image_url: string | null; category_emoji: string | null }>();
  return results;
}

/** FTS インデックスを商品の現在値で更新 */
export async function syncProductFts(db: D1Database, productId: number) {
  const row = await db
    .prepare("SELECT p.name, m.name AS maker FROM products p LEFT JOIN makers m ON m.id = p.maker_id WHERE p.id = ?")
    .bind(productId)
    .first<{ name: string; maker: string | null }>();
  await db.prepare("DELETE FROM products_fts WHERE rowid = ?").bind(productId).run();
  if (row) {
    await db
      .prepare("INSERT INTO products_fts(rowid, name, maker) VALUES (?, ?, ?)")
      .bind(productId, row.name, row.maker ?? "")
      .run();
  }
}

export async function upsertMaker(db: D1Database, name: string | null | undefined) {
  const n = name?.trim();
  if (!n) return null;
  await db.prepare("INSERT INTO makers(name) VALUES (?) ON CONFLICT(name) DO NOTHING").bind(n).run();
  const row = await db.prepare("SELECT id FROM makers WHERE name = ?").bind(n).first<{ id: number }>();
  return row?.id ?? null;
}

// ===== 週間まとめ =====
import { addDays } from "./weeks";
export { addDays, mondayOf, todayJst } from "./weeks";

export async function listWeeks(db: D1Database, limit = 26) {
  const { results } = await db
    .prepare(
      `SELECT date(released_on, '-6 days', 'weekday 1') AS week, COUNT(*) AS n
       FROM products WHERE status = 'published' AND released_on IS NOT NULL
       GROUP BY week ORDER BY week DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ week: string; n: number }>();
  return results;
}

export type WeeklyProduct = ProductRow & { channels: string | null };

export async function weekProducts(db: D1Database, monday: string) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, m.name AS maker, c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji,
              p.price, p.kcal, p.description, p.image_key, p.image_url, p.region, p.accent, p.released_on, p.rating_avg, p.review_count,
              p.status, p.source_url, p.jan,
              (SELECT GROUP_CONCAT(ch.slug) FROM product_channels pc JOIN channels ch ON ch.id = pc.channel_id WHERE pc.product_id = p.id) AS channels
       FROM products p
       LEFT JOIN makers m ON m.id = p.maker_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'published' AND p.released_on BETWEEN ? AND ?
       ORDER BY p.rating_avg DESC, p.review_count DESC, p.released_on DESC`,
    )
    .bind(monday, addDays(monday, 6))
    .all<WeeklyProduct>();
  return results;
}

// ===== 口コミの Good / Bad・レビュアー集計 =====

/** レビュアーの集計（口コミ数・もらった Good / Bad）を再計算 */
export async function recalcReviewer(db: D1Database, reviewerId: string, nickname?: string) {
  await db
    .prepare(
      `INSERT INTO reviewers(id, nickname, review_count, good_received, bad_received, first_count)
       SELECT ?1, COALESCE(?2, (SELECT nickname FROM reviews WHERE reviewer_id = ?1 ORDER BY id DESC LIMIT 1), '名無し'),
              COUNT(*), COALESCE(SUM(good_count), 0), COALESCE(SUM(bad_count), 0), COALESCE(SUM(is_first), 0)
       FROM reviews WHERE reviewer_id = ?1 AND status = 'published'
       ON CONFLICT(id) DO UPDATE SET
         nickname = COALESCE(?2, reviewers.nickname),
         review_count = excluded.review_count, good_received = excluded.good_received, bad_received = excluded.bad_received,
         first_count = excluded.first_count,
         updated_at = datetime('now')`,
    )
    .bind(reviewerId, nickname ?? null)
    .run();
}

/**
 * Good / Bad を投票（同じボタンをもう一度押すと取り消し、逆を押すと切り替え）。
 * 自分の口コミには投票できない。
 */
export async function voteReview(db: D1Database, reviewId: number, voterId: string, value: 1 | -1) {
  const review = await db.prepare("SELECT id, reviewer_id, status FROM reviews WHERE id = ?").bind(reviewId).first<{ id: number; reviewer_id: string | null; status: string }>();
  if (!review || review.status !== "published") return { error: "口コミが見つかりません" as const };
  if (review.reviewer_id && review.reviewer_id === voterId) return { error: "自分の口コミには投票できません" as const };

  const prev = await db.prepare("SELECT value FROM review_votes WHERE review_id = ? AND voter_id = ?").bind(reviewId, voterId).first<{ value: number }>();
  let mine: 1 | -1 | 0 = value;
  if (prev?.value === value) {
    await db.prepare("DELETE FROM review_votes WHERE review_id = ? AND voter_id = ?").bind(reviewId, voterId).run();
    mine = 0;
  } else {
    await db
      .prepare("INSERT INTO review_votes(review_id, voter_id, value) VALUES (?, ?, ?) ON CONFLICT(review_id, voter_id) DO UPDATE SET value = excluded.value, created_at = datetime('now')")
      .bind(reviewId, voterId, value)
      .run();
  }
  const counts = await db
    .prepare(
      `UPDATE reviews SET
         good_count = (SELECT COUNT(*) FROM review_votes WHERE review_id = ?1 AND value = 1),
         bad_count = (SELECT COUNT(*) FROM review_votes WHERE review_id = ?1 AND value = -1)
       WHERE id = ?1 RETURNING good_count, bad_count`,
    )
    .bind(reviewId)
    .first<{ good_count: number; bad_count: number }>();

  // Bad が多い口コミは自動で「要確認」へ（管理画面で判断）
  if (counts && counts.bad_count >= 5 && counts.bad_count > counts.good_count * 2) {
    await db.prepare("UPDATE reviews SET status = 'flagged' WHERE id = ? AND status = 'published'").bind(reviewId).run();
  }
  if (review.reviewer_id) {
    await recalcReviewer(db, review.reviewer_id);
    if (value === 1) await (await import("./achievements.server")).notifyNewAchievements(db, review.reviewer_id);
  }
  return { mine, good: counts?.good_count ?? 0, bad: counts?.bad_count ?? 0 };
}

export async function myVotes(db: D1Database, voterId: string | null, reviewIds: number[]) {
  if (!voterId || reviewIds.length === 0) return {} as Record<number, 1 | -1>;
  const { results } = await db
    .prepare(`SELECT review_id, value FROM review_votes WHERE voter_id = ? AND review_id IN (${reviewIds.map(() => "?").join(",")})`)
    .bind(voterId, ...reviewIds)
    .all<{ review_id: number; value: 1 | -1 }>();
  return Object.fromEntries(results.map((r) => [r.review_id, r.value])) as Record<number, 1 | -1>;
}

// ===== 気になる（テーブル名は bookmarks） =====
export async function bookmarkedIds(db: D1Database, userId: string) {
  const { results } = await db.prepare("SELECT product_id FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000").bind(userId).all<{ product_id: number }>();
  return results.map((r) => r.product_id);
}

export async function toggleBookmark(db: D1Database, userId: string, productId: number, on: boolean) {
  if (on) {
    await db.prepare("INSERT OR IGNORE INTO bookmarks(user_id, product_id) SELECT ?, id FROM products WHERE id = ? AND status = 'published'").bind(userId, productId).run();
  } else {
    await db.prepare("DELETE FROM bookmarks WHERE user_id = ? AND product_id = ?").bind(userId, productId).run();
  }
}

export async function bookmarkedProducts(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(`${PRODUCT_SELECT} JOIN bookmarks b ON b.product_id = p.id WHERE b.user_id = ? AND p.status = 'published' ORDER BY b.created_at DESC LIMIT 200`)
    .bind(userId)
    .all<ProductRow>();
  return results;
}
