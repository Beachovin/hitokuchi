import { env } from "cloudflare:test";

let seq = 0;
const next = () => ++seq;

/** 日本時間の今日から n 日ずらした日付（YYYY-MM-DD） */
export const day = (n = 0) => new Date(Date.now() + 9 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

export async function addUser(o: { nickname?: string; email?: string; role?: "user" | "admin" } = {}) {
  const n = next();
  const id = `user-${n}`;
  await env.DB.prepare("INSERT INTO users(id, google_sub, email, nickname, role) VALUES (?, ?, ?, ?, ?)")
    .bind(id, `sub-${n}`, o.email ?? `u${n}@example.test`, o.nickname ?? `ユーザー${n}`, o.role ?? "user")
    .run();
  return id;
}

export async function addProduct(o: { name?: string; maker?: string; category?: string; releasedOn?: string | null; imageUrl?: string | null; imageKey?: string | null } = {}) {
  const n = next();
  const maker = o.maker ?? "セブン-イレブン";
  await env.DB.prepare("INSERT OR IGNORE INTO makers(name) VALUES (?)").bind(maker).run();
  const row = await env.DB.prepare(
    `INSERT INTO products(name, maker_id, category_id, released_on, image_url, image_key)
     VALUES (?, (SELECT id FROM makers WHERE name = ?), (SELECT id FROM categories WHERE slug = ?), ?, ?, ?) RETURNING id`,
  )
    .bind(o.name ?? `テスト商品${n}`, maker, o.category ?? "sweets", o.releasedOn === undefined ? day(0) : o.releasedOn, o.imageUrl === undefined ? `https://img.example.test/${n}.jpg` : o.imageUrl, o.imageKey ?? null)
    .first<{ id: number }>();
  return row!.id;
}

export async function addReview(productId: number, userId: string, o: { rating?: number; status?: string; imageKey?: string | null; isFirst?: boolean } = {}) {
  const row = await env.DB.prepare(
    "INSERT INTO reviews(product_id, reviewer_id, nickname, rating, body, status, image_key, is_first) VALUES (?, ?, 'テスト', ?, 'おいしかったです。また買います。', ?, ?, ?) RETURNING id",
  )
    .bind(productId, userId, o.rating ?? 4, o.status ?? "published", o.imageKey ?? null, o.isFirst ? 1 : 0)
    .first<{ id: number }>();
  return row!.id;
}

export async function addCandidate(o: { name: string; adapter?: string; externalId?: string; duplicateOf?: number | null; category?: string | null; price?: number | null }) {
  const n = next();
  const adapter = o.adapter ?? "seven";
  const row = await env.DB.prepare(
    `INSERT INTO product_candidates(source_id, source_url, name, maker, category_hint, price, released_on, image_url, external_key, duplicate_of, region)
     VALUES ((SELECT id FROM scrape_sources WHERE adapter = ? LIMIT 1), ?, ?, 'セブン-イレブン', ?, ?, ?, ?, ?, ?, '全国') RETURNING id`,
  )
    .bind(adapter, `https://example.test/item/${n}`, o.name, o.category === undefined ? "sweets" : o.category, o.price === undefined ? 300 : o.price, day(0), `https://img.example.test/c${n}.jpg`, `${adapter}:${o.externalId ?? `ext-${n}`}`, o.duplicateOf ?? null)
    .first<{ id: number }>();
  return row!.id;
}

export const count = async (sql: string, ...binds: unknown[]) => (await env.DB.prepare(sql).bind(...binds).first<{ n: number }>())!.n;

/** 先頭バイトだけ本物の、テスト用の小さな画像データ */
export const fakeImage = (type: "jpeg" | "png" | "webp" | "gif" = "webp") => {
  const head: Record<string, number[]> = {
    jpeg: [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0],
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0],
    gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0],
    webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  };
  return new Uint8Array([...head[type], ...new Array(64).fill(1)]);
};
