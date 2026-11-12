import { recalcProductRating, recalcReviewer } from "./db.server";

/** 停止できない相手（オーナー・管理者・自分）か */
export async function suspendable(env: Env, targetId: string, adminId: string) {
  if (targetId === adminId) return { error: "自分自身は停止できません" };
  const u = await env.DB.prepare("SELECT email, role, is_demo FROM users WHERE id = ?").bind(targetId).first<{ email: string; role: string; is_demo: number }>();
  if (!u) return { error: "ユーザーが見つかりません" };
  const owners = env.ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase());
  if (u.role === "admin" || owners.includes(u.email.toLowerCase())) return { error: "管理者アカウントは停止できません" };
  return { user: u };
}

/**
 * アカウント停止：ログイン不可・セッション削除・公開中の口コミを非表示（解除時に戻せるよう印を付ける）・未対応の通報を対応済みに
 */
export async function suspendUser(env: Env, userId: string, reason: string, adminEmail: string) {
  const { DB } = env;
  const products = (await DB.prepare("SELECT DISTINCT product_id FROM reviews WHERE reviewer_id = ? AND status = 'published'").bind(userId).all<{ product_id: number }>()).results;
  await DB.batch([
    DB.prepare("UPDATE users SET suspended_at = datetime('now'), suspended_reason = ? WHERE id = ?").bind(reason.slice(0, 300), userId),
    DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    DB.prepare("UPDATE reviews SET status = 'hidden', hidden_by_suspension = 1 WHERE reviewer_id = ? AND status = 'published'").bind(userId),
    DB.prepare("UPDATE user_reports SET status = 'actioned', resolved_by = ?, resolved_at = datetime('now') WHERE target_user_id = ? AND status = 'open'").bind(adminEmail, userId),
  ]);
  for (const p of products) await recalcProductRating(DB, p.product_id);
  await recalcReviewer(DB, userId);
  return { hiddenReviews: products.length };
}

/** 停止解除：停止で非表示にした口コミを元に戻す */
export async function unsuspendUser(env: Env, userId: string) {
  const { DB } = env;
  const products = (await DB.prepare("SELECT DISTINCT product_id FROM reviews WHERE reviewer_id = ? AND hidden_by_suspension = 1").bind(userId).all<{ product_id: number }>()).results;
  await DB.batch([
    DB.prepare("UPDATE users SET suspended_at = NULL, suspended_reason = NULL WHERE id = ?").bind(userId),
    DB.prepare("UPDATE reviews SET status = 'published', hidden_by_suspension = 0 WHERE reviewer_id = ? AND hidden_by_suspension = 1").bind(userId),
  ]);
  for (const p of products) await recalcProductRating(DB, p.product_id);
  await recalcReviewer(DB, userId);
}
