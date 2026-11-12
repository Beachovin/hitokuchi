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

// ===== 使われていない画像の掃除 =====

const SWEEP_PAGES_PER_RUN = 5; // 1 回の実行で調べるのは最大 5,000 個。続きは翌日（位置を settings に保存）
const SWEEP_MIN_AGE_MS = 24 * 3600_000; // アップロード直後（保存処理の途中）の画像を消さないための猶予
const SWEEP_CURSOR_KEY = "image_sweep_cursor";

/**
 * R2 にあるのに、どのユーザー・口コミ・商品からも参照されていない画像を削除する。
 * 退会・口コミ削除・商品の自動削除・アップロード途中の失敗などで残った画像が対象。
 * アップロードから 24 時間以内のものは処理中の可能性があるので触らない。
 */
export async function sweepOrphanImages(env: Env, now = Date.now()) {
  const { DB, IMAGES } = env;
  const saved = await DB.prepare("SELECT value FROM settings WHERE key = ?").bind(SWEEP_CURSOR_KEY).first<{ value: string }>();
  let cursor: string | undefined = saved?.value || undefined;
  let scanned = 0;
  let deleted = 0;

  for (let page = 0; page < SWEEP_PAGES_PER_RUN; page++) {
    const list = await IMAGES.list({ cursor, limit: 1000 });
    scanned += list.objects.length;
    const old = list.objects.filter((o) => now - o.uploaded.getTime() > SWEEP_MIN_AGE_MS).map((o) => o.key);
    if (old.length) {
      const used = await referencedKeys(DB, old);
      const orphans = old.filter((k) => !used.has(k));
      if (orphans.length) {
        await IMAGES.delete(orphans);
        deleted += orphans.length;
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
    if (!cursor) break;
  }

  // 最後まで見終わったら位置をリセットし、次回は先頭から
  await DB.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .bind(SWEEP_CURSOR_KEY, cursor ?? "")
    .run();
  return { scanned, deleted, finished: !cursor };
}

/** 渡したキーのうち、DB から参照されているもの */
async function referencedKeys(DB: D1Database, keys: string[]) {
  const stmts = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    stmts.push(
      DB.prepare(
        `SELECT k FROM (
           SELECT avatar_key AS k FROM users WHERE avatar_key IS NOT NULL
           UNION ALL SELECT image_key FROM reviews WHERE image_key IS NOT NULL
           UNION ALL SELECT image_key FROM products WHERE image_key IS NOT NULL
         ) WHERE k IN (${chunk.map(() => "?").join(",")})`,
      ).bind(...chunk),
    );
  }
  const used = new Set<string>();
  for (const r of await DB.batch<{ k: string }>(stmts)) r.results.forEach((x) => used.add(x.k));
  return used;
}

// ===== そのほかの後片付け =====

/** 期限切れのセッション・古い通知・古い監査ログを削除する */
export async function purgeExpiredRecords(DB: D1Database) {
  const [sessions, notifications, audits] = await DB.batch([
    DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    DB.prepare("DELETE FROM notifications WHERE created_at < datetime('now', '-90 days')"),
    DB.prepare("DELETE FROM admin_audit_logs WHERE created_at < datetime('now', '-365 days')"),
  ]);
  return { sessions: sessions.meta.changes ?? 0, notifications: notifications.meta.changes ?? 0, audits: audits.meta.changes ?? 0 };
}

export type MaintenanceResult = {
  at: string;
  purge?: Awaited<ReturnType<typeof purgeOldProducts>>;
  images?: Awaited<ReturnType<typeof sweepOrphanImages>>;
  records?: Awaited<ReturnType<typeof purgeExpiredRecords>>;
  errors: string[];
};

/** 毎朝のメンテナンスをまとめて実行し、結果を管理画面に出せるよう settings に残す */
export async function runMaintenance(env: Env): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { at: new Date().toISOString(), errors: [] };
  const step = async <T>(name: string, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      console.error(`maintenance ${name} failed`, e);
      result.errors.push(`${name}: ${String(e).slice(0, 200)}`);
      return undefined;
    }
  };
  result.purge = await step("purge", () => purgeOldProducts(env));
  result.images = await step("images", () => sweepOrphanImages(env));
  result.records = await step("records", () => purgeExpiredRecords(env.DB));
  await env.DB.prepare("INSERT INTO settings(key, value) VALUES ('maintenance_last', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
    .bind(JSON.stringify(result))
    .run();
  return result;
}
