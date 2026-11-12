import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { tierOf } from "~/lib/reviewer-tier";
import { recalcReviewer } from "~/lib/db.server";
import { purgeExpiredRecords, purgeOldProducts, runMaintenance, sweepOrphanImages } from "~/lib/retention.server";
import { addCandidate, addProduct, addReview, addUser, count, day, fakeImage } from "../helpers";

const put = (key: string) => env.IMAGES.put(key, fakeImage(), { httpMetadata: { contentType: "image/webp" } });
const exists = async (key: string) => (await env.IMAGES.head(key)) !== null;
const TOMORROW = Date.now() + 25 * 3600_000; // 「アップロードから 24 時間以上たった」状態を作る

describe("発売から 1 か月を過ぎた商品の自動削除", () => {
  it("古い商品を、口コミ・気になる・候補・画像ごと削除する", async () => {
    const user = await addUser();
    const oldId = await addProduct({ name: "古い商品", releasedOn: day(-31), imageKey: "products/old.webp" });
    const newId = await addProduct({ name: "新しい商品", releasedOn: day(-29) });
    const futureId = await addProduct({ name: "発売予定の商品", releasedOn: day(10) });
    await put("products/old.webp");
    await put("reviews/old/photo.webp");
    await addReview(oldId, user, { imageKey: "reviews/old/photo.webp" });
    await addReview(newId, user);
    await env.DB.prepare("INSERT INTO bookmarks(user_id, product_id) VALUES (?, ?)").bind(user, oldId).run();
    await env.DB.prepare("INSERT INTO products_fts(rowid, name, maker) VALUES (?, '古い商品', '')").bind(oldId).run();
    await addCandidate({ name: "古い商品", externalId: "OLD-1", duplicateOf: oldId });
    await env.DB.prepare("UPDATE product_candidates SET status = 'approved' WHERE duplicate_of = ?").bind(oldId).run();
    await recalcReviewer(env.DB, user);

    const r = await purgeOldProducts(env);
    expect(r).toEqual({ products: 1, reviews: 1 });
    expect(await count("SELECT COUNT(*) n FROM products WHERE id = ?", oldId)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM products WHERE id IN (?, ?)", newId, futureId)).toBe(2);
    expect(await count("SELECT COUNT(*) n FROM reviews WHERE product_id = ?", oldId)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM bookmarks WHERE product_id = ?", oldId)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM products_fts WHERE rowid = ?", oldId)).toBe(0);
    expect(await exists("products/old.webp")).toBe(false);
    expect(await exists("reviews/old/photo.webp")).toBe(false);
  });

  it("削除した商品は再収集されないよう商品コードを覚えておく", async () => {
    const oldId = await addProduct({ releasedOn: day(-40) });
    await addCandidate({ name: "消える商品", adapter: "lawson", externalId: "L-777", duplicateOf: oldId });
    await purgeOldProducts(env);
    expect(await count("SELECT COUNT(*) n FROM product_candidates WHERE external_key = 'lawson:L-777'")).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM scrape_seen WHERE external_key = 'lawson:L-777'")).toBe(1);
  });

  it("口コミを書いた人のポイントを計算し直す", async () => {
    const user = await addUser();
    const oldId = await addProduct({ releasedOn: day(-35) });
    const keepId = await addProduct({ releasedOn: day(-1) });
    await addReview(oldId, user);
    await addReview(keepId, user);
    await recalcReviewer(env.DB, user);
    await purgeOldProducts(env);
    const stats = await env.DB.prepare("SELECT review_count, good_received, bad_received FROM reviewers WHERE id = ?").bind(user).first<{ review_count: number; good_received: number; bad_received: number }>();
    expect(stats!.review_count).toBe(1);
    expect(tierOf(stats).points).toBe(3);
  });

  it("発売日が無い商品は掲載日で判断する", async () => {
    const id = await addProduct({ releasedOn: null });
    await purgeOldProducts(env);
    expect(await count("SELECT COUNT(*) n FROM products WHERE id = ?", id)).toBe(1);
    await env.DB.prepare("UPDATE products SET created_at = datetime('now', '-45 days') WHERE id = ?").bind(id).run();
    await purgeOldProducts(env);
    expect(await count("SELECT COUNT(*) n FROM products WHERE id = ?", id)).toBe(0);
  });
});

describe("使われていない画像の掃除", () => {
  it("どこからも参照されていない画像だけを削除する", async () => {
    const user = await addUser();
    const product = await addProduct({ imageKey: "products/used.webp" });
    await env.DB.prepare("UPDATE users SET avatar_key = 'avatars/used.webp' WHERE id = ?").bind(user).run();
    await addReview(product, user, { imageKey: "reviews/1/used.webp" });
    for (const k of ["avatars/used.webp", "reviews/1/used.webp", "products/used.webp", "avatars/orphan.webp", "reviews/9/orphan.webp"]) await put(k);

    const r = await sweepOrphanImages(env, TOMORROW);
    expect(r).toMatchObject({ deleted: 2, finished: true });
    expect(await exists("avatars/used.webp")).toBe(true);
    expect(await exists("reviews/1/used.webp")).toBe(true);
    expect(await exists("products/used.webp")).toBe(true);
    expect(await exists("avatars/orphan.webp")).toBe(false);
    expect(await exists("reviews/9/orphan.webp")).toBe(false);
  });

  it("アップロードから 24 時間以内の画像は（保存処理の途中かもしれないので）消さない", async () => {
    await put("avatars/just-uploaded.webp");
    expect(await sweepOrphanImages(env)).toMatchObject({ deleted: 0 });
    expect(await exists("avatars/just-uploaded.webp")).toBe(true);
  });

  it("参照の有無を 100 個以上まとめて確認できる", async () => {
    const user = await addUser();
    const product = await addProduct();
    for (let i = 0; i < 130; i++) await put(`reviews/bulk/${i}.webp`);
    await addReview(product, user, { imageKey: "reviews/bulk/77.webp" });
    const r = await sweepOrphanImages(env, TOMORROW);
    expect(r.deleted).toBeGreaterThanOrEqual(129);
    expect(await exists("reviews/bulk/77.webp")).toBe(true);
    expect((await env.IMAGES.list({ prefix: "reviews/bulk/" })).objects.map((o) => o.key)).toEqual(["reviews/bulk/77.webp"]);
  });
});

describe("そのほかの後片付け", () => {
  it("期限切れのログイン情報・古い通知・古い監査ログを削除する", async () => {
    const user = await addUser();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sessions(id, user_id, expires_at) VALUES ('expired', ?, datetime('now', '-1 day')), ('valid', ?, datetime('now', '+1 day'))").bind(user, user),
      env.DB.prepare("INSERT INTO notifications(user_id, kind, body, link, ref, created_at) VALUES (?, 'achievement', '古い', '/', 'a', datetime('now', '-100 days')), (?, 'achievement', '新しい', '/', 'b', datetime('now'))").bind(user, user),
      env.DB.prepare("INSERT INTO admin_audit_logs(email, action, created_at) VALUES ('a@example.test', 'x', datetime('now', '-400 days')), ('a@example.test', 'y', datetime('now'))"),
    ]);
    expect(await purgeExpiredRecords(env.DB)).toEqual({ sessions: 1, notifications: 1, audits: 1 });
    expect(await count("SELECT COUNT(*) n FROM sessions WHERE id = 'valid'")).toBe(1);
  });

  it("まとめて実行し、結果を管理画面用に記録する", async () => {
    const r = await runMaintenance(env);
    expect(r.errors).toEqual([]);
    const saved = await env.DB.prepare("SELECT value FROM settings WHERE key = 'maintenance_last'").first<{ value: string }>();
    expect(JSON.parse(saved!.value)).toMatchObject({ purge: { products: 0 }, images: { finished: true } });
  });
});
