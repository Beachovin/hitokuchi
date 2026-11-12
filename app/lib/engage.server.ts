// 食べた記録・サイト内通知

export async function eatenIds(db: D1Database, userId: string) {
  const { results } = await db.prepare("SELECT product_id FROM eaten WHERE user_id = ? ORDER BY created_at DESC LIMIT 3000").bind(userId).all<{ product_id: number }>();
  return results.map((r) => r.product_id);
}

export async function setEaten(db: D1Database, userId: string, productId: number, on: boolean) {
  if (on) await db.prepare("INSERT OR IGNORE INTO eaten(user_id, product_id) SELECT ?, id FROM products WHERE id = ? AND status = 'published'").bind(userId, productId).run();
  else await db.prepare("DELETE FROM eaten WHERE user_id = ? AND product_id = ?").bind(userId, productId).run();
}

export type Notice = { id: number; kind: string; body: string; link: string; read_at: string | null; created_at: string; image_url: string | null };

export async function listNotifications(db: D1Database, userId: string, limit = 50) {
  const { results } = await db
    .prepare(
      `SELECT n.id, n.kind, n.body, n.link, n.read_at, n.created_at, p.image_url
       FROM notifications n LEFT JOIN products p ON p.id = n.product_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<Notice>();
  return results;
}

export async function unreadCount(db: D1Database, userId: string) {
  return (await db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(userId).first<{ n: number }>())?.n ?? 0;
}

export async function markAllRead(db: D1Database, userId: string) {
  await db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").bind(userId).run();
}

export async function notify(db: D1Database, n: { userId: string; kind: string; productId?: number | null; ref?: string; body: string; link: string }) {
  await db
    .prepare("INSERT OR IGNORE INTO notifications(user_id, kind, product_id, ref, body, link) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(n.userId, n.kind, n.productId ?? null, n.ref ?? "", n.body, n.link)
    .run();
}

/**
 * 毎朝の通知生成（cron から呼ぶ）。同じ通知は UNIQUE 制約で二重に作られない。
 *  - 気になる商品の発売日当日 →「今日発売です」
 *  - 気になる／食べた商品で、発売から 3〜21 日経っても口コミが無い →「もう食べましたか？」
 */
export async function generateNotifications(db: D1Database, today: string) {
  const r1 = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications(user_id, kind, product_id, ref, body, link)
       SELECT b.user_id, 'release_today', p.id, '', '「' || p.name || '」が今日発売です！', '/products/' || p.id
       FROM bookmarks b JOIN products p ON p.id = b.product_id
       WHERE p.status = 'published' AND p.released_on = ?`,
    )
    .bind(today)
    .run();
  const r2 = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications(user_id, kind, product_id, ref, body, link)
       SELECT t.user_id, 'ask_review', p.id, '', '「' || p.name || '」はもう食べましたか？ 星をタップしてひとこと口コミをどうぞ', '/products/' || p.id || '#quick'
       FROM (SELECT user_id, product_id FROM bookmarks UNION SELECT user_id, product_id FROM eaten) t
       JOIN products p ON p.id = t.product_id
       WHERE p.status = 'published'
         AND p.released_on BETWEEN date(?, '-21 days') AND date(?, '-3 days')
         AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.reviewer_id = t.user_id)`,
    )
    .bind(today, today)
    .run();
  return { releaseToday: r1.meta.changes ?? 0, askReview: r2.meta.changes ?? 0 };
}
