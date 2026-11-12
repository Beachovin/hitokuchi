import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ensureBattles, generateWeeklyBattles, getBattles, voteBattle } from "~/lib/battles.server";
import { addDays, mondayOf } from "~/lib/weeks";
import { addProduct, count, day } from "../helpers";

// テストごとに別の週を使う（同じ DB を共有しても干渉しないように）
let offset = 100;
const freshWeek = () => {
  const week = mondayOf(day((offset += 7)));
  return { week, sunday: addDays(week, 6) };
};

describe("週ごとの新商品バトル", () => {
  it("ジャンルごとに 1 つずつ、できるだけ別チェーン同士で作る", async () => {
    const { week, sunday } = freshWeek();
    const a = await addProduct({ category: "sweets", maker: "セブン-イレブン", releasedOn: week });
    await addProduct({ category: "sweets", maker: "セブン-イレブン", releasedOn: week });
    const c = await addProduct({ category: "sweets", maker: "ローソン", releasedOn: week });
    await addProduct({ category: "bread", maker: "ファミリーマート", releasedOn: week });
    await addProduct({ category: "bread", maker: "ミニストップ", releasedOn: addDays(week, 2) });
    await addProduct({ category: "noodle", maker: "ローソン", releasedOn: week }); // 1 商品だけのジャンルは作らない
    await env.DB.prepare("UPDATE products SET review_count = 9 WHERE id = ?").bind(a).run(); // 注目商品

    expect(await generateWeeklyBattles(env.DB, week, sunday)).toEqual({ created: 2 });
    const sweets = await env.DB.prepare("SELECT product_a, product_b FROM battles b JOIN categories c ON c.id = b.category_id WHERE b.week = ? AND c.slug = 'sweets'").bind(week).first();
    expect(sweets).toEqual({ product_a: a, product_b: c });
  });

  it("何度実行しても同じ週・同じジャンルのバトルは増えない", async () => {
    const { week, sunday } = freshWeek();
    await addProduct({ category: "ice", releasedOn: week });
    await addProduct({ category: "ice", maker: "ローソン", releasedOn: week });
    await generateWeeklyBattles(env.DB, week, sunday);
    expect(await generateWeeklyBattles(env.DB, week, sunday)).toEqual({ created: 0 });
    await ensureBattles(env.DB, week, sunday);
    expect(await count("SELECT COUNT(*) n FROM battles WHERE week = ?", week)).toBe(1);
  });

  it("画像の無い商品・他の週の商品・非公開の商品は対戦に出さない", async () => {
    const { week, sunday } = freshWeek();
    await addProduct({ category: "drink", releasedOn: week, imageUrl: null });
    await addProduct({ category: "drink", releasedOn: addDays(week, -1) });
    const hidden = await addProduct({ category: "drink", releasedOn: week });
    await env.DB.prepare("UPDATE products SET status = 'hidden' WHERE id = ?").bind(hidden).run();
    await addProduct({ category: "drink", releasedOn: week });
    expect(await generateWeeklyBattles(env.DB, week, sunday)).toEqual({ created: 0 });
  });

  it("投票は 1 人 1 回で、あとから変更できない", async () => {
    const { week, sunday } = freshWeek();
    await addProduct({ category: "snack", releasedOn: week });
    await addProduct({ category: "snack", maker: "ローソン", releasedOn: week });
    await generateWeeklyBattles(env.DB, week, sunday);
    const [battle] = await getBattles(env.DB, week, null);

    expect(await voteBattle(env.DB, battle.id, "u:alice", "a")).toBe(true);
    expect(await voteBattle(env.DB, battle.id, "u:alice", "b")).toBe(false);
    expect(await voteBattle(env.DB, battle.id, "a:anon-cookie", "b")).toBe(true);

    const [mine] = await getBattles(env.DB, week, "u:alice");
    expect(mine).toMatchObject({ total: 2, mine: "a" });
    expect(mine.a.votes).toBe(1);
    expect(mine.b.votes).toBe(1);
    expect(mine.genre?.slug).toBe("snack");
  });
});
