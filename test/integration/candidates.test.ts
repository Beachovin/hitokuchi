import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { approveCandidate } from "~/lib/candidates.server";
import { listProducts } from "~/lib/db.server";
import { addCandidate, addProduct, count } from "../helpers";

describe("候補の承認（商品として公開）", () => {
  it("候補から商品を作り、販売店と検索用データも登録する", async () => {
    const id = await addCandidate({ name: "ふわふわドームケーキ 生キャラメル", category: "sweets", price: 321 });
    await approveCandidate(env.DB, id, null);

    const c = await env.DB.prepare("SELECT status, duplicate_of FROM product_candidates WHERE id = ?").bind(id).first<{ status: string; duplicate_of: number }>();
    expect(c!.status).toBe("approved");
    const p = await env.DB.prepare("SELECT p.*, c.slug AS cat, m.name AS maker FROM products p JOIN categories c ON c.id = p.category_id JOIN makers m ON m.id = p.maker_id WHERE p.id = ?").bind(c!.duplicate_of).first<Record<string, unknown>>();
    expect(p).toMatchObject({ name: "ふわふわドームケーキ 生キャラメル", price: 321, cat: "sweets", maker: "セブン-イレブン", status: "published", region: "全国" });
    expect(await count("SELECT COUNT(*) n FROM product_channels WHERE product_id = ?", c!.duplicate_of)).toBe(1);

    const found = await listProducts(env.DB, { q: "ドームケーキ" });
    expect(found.map((x) => x.id)).toContain(c!.duplicate_of);
  });

  it("管理画面で手直しした値が優先される", async () => {
    const id = await addCandidate({ name: "なまえ まちがい", price: 100 });
    const form = new FormData();
    form.set(`name_${id}`, "正しい商品名");
    form.set(`price_${id}`, "250");
    form.set(`kcal_${id}`, "");
    await approveCandidate(env.DB, id, form);
    const p = await env.DB.prepare("SELECT name, price, kcal FROM products WHERE id = (SELECT duplicate_of FROM product_candidates WHERE id = ?)").bind(id).first();
    expect(p).toEqual({ name: "正しい商品名", price: 250, kcal: null });
  });

  it("既存商品と重複する候補は新しく作らず、空欄だけ埋める", async () => {
    const productId = await addProduct({ name: "既存の商品" });
    await env.DB.prepare("UPDATE products SET price = 500, description = NULL WHERE id = ?").bind(productId).run();
    const id = await addCandidate({ name: "既存の商品", duplicateOf: productId, price: 999 });
    await env.DB.prepare("UPDATE product_candidates SET description = '候補から補った説明です' WHERE id = ?").bind(id).run();
    const before = await count("SELECT COUNT(*) n FROM products");
    await approveCandidate(env.DB, id, null);
    expect(await count("SELECT COUNT(*) n FROM products")).toBe(before);
    expect(await env.DB.prepare("SELECT price, description FROM products WHERE id = ?").bind(productId).first()).toEqual({ price: 500, description: "候補から補った説明です" });
  });

  it("承認済み・却下済みの候補をもう一度承認しても何も起きない", async () => {
    const id = await addCandidate({ name: "二重承認テスト" });
    await approveCandidate(env.DB, id, null);
    const n = await count("SELECT COUNT(*) n FROM products");
    await approveCandidate(env.DB, id, null);
    expect(await count("SELECT COUNT(*) n FROM products")).toBe(n);
  });
});

describe("自動公開（承認せずにそのまま公開）", () => {
  it("新しい商品は公開し、同じチェーンの似た名前の商品は重複として除外する", async () => {
    const { autoPublish } = await import("~/lib/candidates.server");
    await approveCandidate(env.DB, await addCandidate({ name: "北海道スフレチーズケーキ キャラメル" }), null);
    const dupExisting = await addCandidate({ name: "北海道スフレチーズケーキ　キャラメル（1個）" });
    const fresh = await addCandidate({ name: "辛ねぎ味噌ラーメン", category: "noodle" });
    const dupInBatch = await addCandidate({ name: "辛ねぎ味噌ラーメン " });
    const flavor = await addCandidate({ name: "北海道スフレチーズケーキ 抹茶" });

    expect(await autoPublish(env.DB, [dupExisting, fresh, dupInBatch, flavor], "セブン-イレブン")).toEqual({ published: 2, duplicates: 2 });
    const status = async (id: number) => (await env.DB.prepare("SELECT status, note FROM product_candidates WHERE id = ?").bind(id).first<{ status: string; note: string }>())!;
    expect((await status(fresh)).status).toBe("approved");
    expect((await status(flavor)).status).toBe("approved"); // 味違いは別商品
    expect(await status(dupExisting)).toMatchObject({ status: "rejected" });
    expect((await status(dupExisting)).note).toContain("重複の可能性");
    expect((await status(dupInBatch)).status).toBe("rejected");
  });

  it("別のチェーンの同じ名前の商品は、それぞれ別の商品として公開する", async () => {
    const { autoPublish } = await import("~/lib/candidates.server");
    const name = "チョコクロワッサン 自動公開テスト";
    await autoPublish(env.DB, [await addCandidate({ name })], "セブン-イレブン");
    const lawson = await addCandidate({ name, adapter: "lawson" });
    await env.DB.prepare("UPDATE product_candidates SET maker = 'ローソン' WHERE id = ?").bind(lawson).run();
    expect(await autoPublish(env.DB, [lawson], "ローソン")).toEqual({ published: 1, duplicates: 0 });
    expect(await count("SELECT COUNT(*) n FROM products WHERE name = ?", name)).toBe(2);
  });
});
