// 古いデータの自動削除（毎朝の定期実行から呼ぶ）
import { recalcReviewer } from "./db.server";
import { addDays, todayJst } from "./weeks";

/** 発売日からこの日数を過ぎた商品を削除する */
export const PRODUCT_RETENTION_DAYS = 30;

const CHUNK = 80; // D1 の 1 文あたりのバインド上限（100）未満に収める

/**
 * 発売日（無ければ掲載日）から 1 か月を過ぎた商品を削除する。
 * 口コミ・気になる・食べた記録・通知・バトル・特集への登録・口コミの Good/Bad や通報も一緒に消える（ON DELETE CASCADE）。
 * R2 の画像（商品画像・口コミ写真）も削除し、口コミを書いた人の集計（ポイント）を再計算する。
 * 一度取り込んだ商品コードは scrape_seen に残し、同じ商品を再収集しないようにする。
 */
export async function purgeOldProducts(env: Env) {
  const { DB } = env;
  const cutoff = addDays(todayJst(), -PRODUCT_RETENTION_DAYS);
  const { results: old } = await DB.prepare(
    "SELECT id, image_key FROM products WHERE COALESCE(released_on, substr(created_at, 1, 10)) < ? LIMIT 2000",
  )
    .bind(cutoff)
    .all<{ id: number; image_key: string | null }>();

  let reviews = 0;
  for (let i = 0; i < old.length; i += CHUNK) {
    const ids = old.slice(i, i + CHUNK).map((p) => p.id);
    const ph = ids.map(() => "?").join(",");
    const { results: revs } = await DB.prepare(`SELECT reviewer_id, image_key FROM reviews WHERE product_id IN (${ph})`)
      .bind(...ids)
      .all<{ reviewer_id: string | null; image_key: string | null }>();
    reviews += revs.length;

    await DB.batch([
      // 再収集防止の記録を残してから、商品に紐づく候補を消す（候補は products を参照しているため先に消す）
      DB.prepare(
        `INSERT OR IGNORE INTO scrape_seen(external_key) SELECT external_key FROM product_candidates WHERE duplicate_of IN (${ph}) AND external_key IS NOT NULL`,
      ).bind(...ids),
      DB.prepare(`DELETE FROM product_candidates WHERE duplicate_of IN (${ph})`).bind(...ids),
      DB.prepare(`DELETE FROM products_fts WHERE rowid IN (${ph})`).bind(...ids),
      DB.prepare(`DELETE FROM products WHERE id IN (${ph})`).bind(...ids),
    ]);

    const keys = [...old.slice(i, i + CHUNK).map((p) => p.image_key), ...revs.map((r) => r.image_key)].filter((k): k is string => !!k);
    if (keys.length) await env.IMAGES.delete(keys);
    for (const rid of new Set(revs.map((r) => r.reviewer_id).filter((r): r is string => !!r))) await recalcReviewer(DB, rid);
  }

  // 候補・ログ・再収集防止の記録も古いものを片付ける
  await DB.batch([
    DB.prepare(
      "INSERT OR IGNORE INTO scrape_seen(external_key) SELECT external_key FROM product_candidates WHERE created_at < datetime('now', ?) AND external_key IS NOT NULL",
    ).bind(`-${PRODUCT_RETENTION_DAYS} days`),
    DB.prepare("DELETE FROM product_candidates WHERE created_at < datetime('now', ?)").bind(`-${PRODUCT_RETENTION_DAYS} days`),
    DB.prepare("DELETE FROM scrape_runs WHERE started_at < datetime('now', '-90 days')"),
    DB.prepare("DELETE FROM scrape_seen WHERE seen_at < datetime('now', '-180 days')"),
  ]);

  return { products: old.length, reviews };
}
