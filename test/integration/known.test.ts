import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { knownKeys } from "../../workers/scrape/known";
import { addCandidate } from "../helpers";

describe("取り込み済みの商品コードの確認", () => {
  it("一覧に商品が多くても（D1 の値の上限 100 を超えても）エラーにならない", async () => {
    // 2026-11-13 の収集で、68 件・76 件の一覧が「too many SQL variables」で失敗した
    const keys = Array.from({ length: 150 }, (_, i) => `familymart:bulk-${i}`);
    await expect(knownKeys(env.DB, keys)).resolves.toBeInstanceOf(Set);
  });
  it("候補として保存済みのもの・削除済みで記録が残っているものを見分ける", async () => {
    await addCandidate({ name: "既存", adapter: "familymart", externalId: "K-1" });
    await env.DB.prepare("INSERT INTO scrape_seen(external_key) VALUES ('familymart:K-2')").run();
    const keys = ["familymart:K-1", "familymart:K-2", "familymart:K-3", ...Array.from({ length: 80 }, (_, i) => `familymart:x-${i}`)];
    const known = await knownKeys(env.DB, keys);
    expect([...known].sort()).toEqual(["familymart:K-1", "familymart:K-2"]);
  });
  it("空なら何もしない", async () => expect((await knownKeys(env.DB, [])).size).toBe(0));
});
