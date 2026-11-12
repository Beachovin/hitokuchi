import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getPublicSettings, getSettings, saveSettings } from "~/lib/settings.server";
import { ADAPTERS } from "../../workers/scrape/adapters";
import { CATEGORY_SLUGS } from "../../workers/scrape/normalize";
import { count } from "../helpers";

describe("マイグレーションと初期データ", () => {
  it("全マイグレーションが空の DB に順番どおり適用できる", async () => {
    const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()).results.map((r) => r.name);
    for (const t of ["products", "reviews", "users", "sessions", "product_candidates", "scrape_sources", "scrape_seen", "battles", "battle_votes", "bookmarks", "eaten", "notifications", "features", "feature_items", "user_reports", "admin_audit_logs", "settings"]) {
      expect(tables, `${t} テーブル`).toContain(t);
    }
  });
  it("収集元は 5 社のアダプターだけで、すべて実装がある", async () => {
    const { results } = await env.DB.prepare("SELECT DISTINCT adapter FROM scrape_sources WHERE adapter IS NOT NULL").all<{ adapter: string }>();
    expect(results.map((r) => r.adapter).sort()).toEqual(Object.keys(ADAPTERS).sort());
  });
  it("収集元の URL は https で、各社の公式ドメインに限られる", async () => {
    const { results } = await env.DB.prepare("SELECT url FROM scrape_sources WHERE adapter IS NOT NULL").all<{ url: string }>();
    for (const { url } of results) expect(new URL(url).protocol + "//" + new URL(url).hostname).toMatch(/^https:\/\/(www\.)?(sej\.co\.jp|family\.co\.jp|lawson\.co\.jp|ministop\.co\.jp|daily-yamazaki\.jp)$/);
  });
  it("整形ルールが使うカテゴリは DB にすべて存在する", async () => {
    for (const slug of CATEGORY_SLUGS) expect(await count("SELECT COUNT(*) n FROM categories WHERE slug = ?", slug), slug).toBe(1);
  });
});

describe("設定", () => {
  it("初期状態は安全側（Claude 整形・自動公開・広告・ダイジェストはオフ）", async () => {
    expect(await getSettings(env.DB)).toMatchObject({ use_claude: false, auto_publish: false, ads_enabled: false, digest_enabled: false, operator_name: "" });
  });
  it("保存した値を読み戻せる", async () => {
    await saveSettings(env.DB, { auto_publish: "1", operator_name: "ひとくち運営", max_items_per_source: "40" });
    expect(await getSettings(env.DB)).toMatchObject({ auto_publish: true, operator_name: "ひとくち運営", max_items_per_source: 40 });
  });
  it("お客様向け画面に渡す設定には内部用の項目を含めない", async () => {
    expect(Object.keys(await getPublicSettings(env.DB)).sort()).toEqual(["ads_enabled", "adsense_client", "adsense_slot", "amazon_tag", "operator_contact", "operator_name", "rakuten_affiliate_id"]);
  });
});
