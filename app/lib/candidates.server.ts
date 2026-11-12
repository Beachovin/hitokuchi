// 候補（スクレイピング結果）を商品として公開する処理。管理画面の承認と自動公開の両方で使う
import { syncProductFts, upsertMaker } from "./db.server";
import { DUPLICATE_THRESHOLD, nameSimilarity } from "../../workers/scrape/normalize";

type Candidate = {
  id: number;
  source_url: string;
  name: string;
  maker: string | null;
  category_hint: string | null;
  jan: string | null;
  price: number | null;
  kcal: number | null;
  released_on: string | null;
  description: string | null;
  image_url: string | null;
  region: string | null;
  duplicate_of: number | null;
  channel_id: number | null;
};

const ACCENTS = ["#f97316", "#e11d48", "#a16207", "#16a34a", "#0ea5e9", "#9333ea", "#db2777", "#ca8a04"];

/** 承認待ちの候補を商品にする（overrides は管理画面での手直し。自動公開では null） */
export async function approveCandidate(DB: D1Database, id: number, overrides: FormData | null) {
  const c = await DB.prepare(
    "SELECT c.*, s.channel_id FROM product_candidates c LEFT JOIN scrape_sources s ON s.id = c.source_id WHERE c.id = ? AND c.status = 'pending'",
  )
    .bind(id)
    .first<Candidate>();
  if (!c) return;
  const get = (k: string) => {
    const v = overrides?.get(`${k}_${id}`);
    return v == null ? undefined : String(v).trim();
  };
  const num = (v: string | undefined, fallback: number | null) => (v === undefined ? fallback : v === "" ? null : Number(v));
  const name = get("name") || c.name;
  const makerId = await upsertMaker(DB, get("maker") ?? c.maker);
  const hinted = c.category_hint
    ? await DB.prepare("SELECT id FROM categories WHERE slug = ? OR name = ?").bind(c.category_hint, c.category_hint).first<{ id: number }>()
    : null;
  const categoryId = num(get("category"), hinted?.id ?? null);
  const price = num(get("price"), c.price);
  const kcal = num(get("kcal"), c.kcal);
  const released = get("released_on") || c.released_on;

  let productId: number;
  if (c.duplicate_of) {
    // 既存商品にマージ（空欄だけ埋める）
    productId = c.duplicate_of;
    await DB.prepare(
      `UPDATE products SET price = COALESCE(price, ?), kcal = COALESCE(kcal, ?), released_on = COALESCE(released_on, ?),
         description = COALESCE(description, ?), jan = COALESCE(jan, ?), source_url = COALESCE(source_url, ?), image_url = COALESCE(image_url, ?), region = COALESCE(region, ?), updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(price, kcal, released, c.description, c.jan, c.source_url, c.image_url, c.region, productId)
      .run();
  } else {
    const row = await DB.prepare(
      `INSERT INTO products(name, maker_id, category_id, jan, price, kcal, description, accent, released_on, source_url, image_url, region)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    )
      .bind(name, makerId, categoryId, c.jan, price, kcal, c.description, ACCENTS[id % ACCENTS.length], released, c.source_url, c.image_url, c.region)
      .first<{ id: number }>();
    productId = row!.id;
    await syncProductFts(DB, productId);
  }
  if (c.channel_id) {
    await DB.prepare("INSERT OR IGNORE INTO product_channels VALUES (?, ?)").bind(productId, c.channel_id).run();
  }
  await DB.prepare("UPDATE product_candidates SET status = 'approved', duplicate_of = ? WHERE id = ?").bind(productId, id).run();
}

/**
 * 保存した候補を公開する。同じチェーンの公開済み商品（直近 60 日）や、今回の候補同士で
 * 名前がほぼ同じものは重複の可能性ありとして公開せず「却下」にする（理由を note に残す）。
 */
export async function autoPublish(DB: D1Database, ids: number[], chainLabel: string) {
  const ph = ids.map(() => "?").join(",");
  const { results: cands } = await DB.prepare(`SELECT id, name FROM product_candidates WHERE id IN (${ph}) AND status = 'pending' ORDER BY id`)
    .bind(...ids)
    .all<{ id: number; name: string }>();
  const { results: existing } = await DB.prepare(
    `SELECT p.id, p.name FROM products p JOIN makers m ON m.id = p.maker_id
     WHERE m.name = ? AND p.created_at >= datetime('now', '-60 days')`,
  )
    .bind(chainLabel)
    .all<{ id: number; name: string }>();
  const pool = [...existing];
  let published = 0;
  let duplicates = 0;
  for (const c of cands) {
    const dup = pool.find((p) => nameSimilarity(p.name, c.name) >= DUPLICATE_THRESHOLD);
    if (dup) {
      await DB.prepare("UPDATE product_candidates SET status = 'rejected', duplicate_of = NULL, note = ? WHERE id = ?")
        .bind(`自動排除：重複の可能性（${dup.name}）`, c.id)
        .run();
      duplicates++;
      continue;
    }
    // 別チェーンの同名商品とは統合しない（チェーンごとに別の商品として公開）
    await DB.prepare("UPDATE product_candidates SET duplicate_of = NULL, note = '自動公開' WHERE id = ?").bind(c.id).run();
    await approveCandidate(DB, c.id, null);
    pool.push({ id: -c.id, name: c.name });
    published++;
  }
  return { published, duplicates };
}
