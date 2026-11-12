import { describe, expect, it } from "vitest";
import { safeReturnTo, validateNickname } from "~/lib/auth.server";
import { AREAS, limitedAreas } from "~/lib/features";
import { imgUrl, regionLabel, releaseLabel, yen } from "~/lib/format";
import { needsReview } from "~/lib/moderation";
import { affiliateLinks } from "~/lib/monetize";
import { demographicLabel } from "~/lib/profile";
import { reviewerPoints, tierOf } from "~/lib/reviewer-tier";
import { needsSummary, parseSummary } from "~/lib/summary.server";
import { addDays, mondayOf } from "~/lib/weeks";
import { day } from "../helpers";

describe("レビュアーのポイントとランク", () => {
  it("ポイント = 口コミ×3 + Good×2 + ファーストレビュー×5 − Bad", () => {
    expect(reviewerPoints({ review_count: 4, good_received: 5, bad_received: 3, first_count: 2 })).toBe(4 * 3 + 5 * 2 + 2 * 5 - 3);
  });
  it("Bad が多くても 0 未満にはならない", () => expect(reviewerPoints({ review_count: 0, good_received: 0, bad_received: 50 })).toBe(0));
  it("ポイントに応じてランクが上がる", () => {
    expect(tierOf(null).id).toBe("rookie");
    expect(tierOf({ review_count: 4, good_received: 0, bad_received: 0 }).id).toBe("bronze"); // 12pt
    expect(tierOf({ review_count: 10, good_received: 0, bad_received: 0 }).id).toBe("silver"); // 30pt ちょうど
    expect(tierOf({ review_count: 20, good_received: 10, bad_received: 0 }).id).toBe("gold"); // 80pt
    expect(tierOf({ review_count: 60, good_received: 10, bad_received: 0 }).id).toBe("platinum"); // 200pt
  });
  it("次のランクを返す（最上位では null）", () => {
    expect(tierOf({ review_count: 1, good_received: 0, bad_received: 0 }).next?.id).toBe("bronze");
    expect(tierOf({ review_count: 100, good_received: 0, bad_received: 0 }).next).toBeNull();
  });
});

describe("週の計算", () => {
  it("どの曜日からでもその週の月曜を返す", () => {
    expect(mondayOf("2026-11-12")).toBe("2026-11-09"); // 木曜
    expect(mondayOf("2026-11-09")).toBe("2026-11-09"); // 月曜
    expect(mondayOf("2026-11-15")).toBe("2026-11-09"); // 日曜
  });
  it("月・年をまたいで日付を足し引きできる", () => {
    expect(addDays("2026-12-29", 6)).toBe("2027-01-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("表示用の整形", () => {
  it("価格", () => {
    expect(yen(1280)).toBe("¥1,280");
    expect(yen(null)).toBe("—");
  });
  it("販売地域を短くする", () => {
    expect(regionLabel("全国")).toBe("全国");
    expect(regionLabel("販売地域：関東、東海")).toBe("関東・東海");
    expect(regionLabel("北海道、東北、関東、東海")).toBe("北海道・東北ほか2エリア");
    expect(regionLabel("※沖縄地域のローソンではお取り扱いしておりません。")).toBe("沖縄を除く全国");
    expect(regionLabel("※画像はイメージです")).toBeNull();
    expect(regionLabel(null)).toBeNull();
  });
  it("発売日は未来なら「発売予定」", () => {
    expect(releaseLabel(day(3))).toMatch(/発売予定$/);
    expect(releaseLabel(day(-3))).toMatch(/\d+\/\d+発売$/);
    expect(releaseLabel(null)).toBeNull();
  });
  it("R2 のキーを URL にする", () => {
    expect(imgUrl("avatars/a b.webp")).toBe("/img/avatars%2Fa%20b.webp");
    expect(imgUrl(null)).toBeNull();
  });
  it("年代・性別のラベルは公開設定されたものだけつなぐ", () => {
    expect(demographicLabel(null, null)).toBeNull();
  });
});

describe("地域限定の判定", () => {
  it("1〜3 エリアだけで売られていれば限定扱い", () => {
    expect(limitedAreas("北海道")).toEqual(["hokkaido"]);
    expect(limitedAreas("関東、東海")).toEqual(["kanto", "tokai"]);
  });
  it("全国販売・「〜を除く」・未設定は限定扱いしない", () => {
    expect(limitedAreas("全国")).toEqual([]);
    expect(limitedAreas("※沖縄地域では取り扱いがありません")).toEqual([]);
    expect(limitedAreas(null)).toEqual([]);
    expect(limitedAreas("北海道、東北、関東、東海、近畿")).toEqual([]);
  });
  it("エリアの slug は重複しない", () => expect(new Set(AREAS.map((a) => a.slug)).size).toBe(AREAS.length));
});

describe("ニックネームとログイン後の戻り先", () => {
  it("2〜16 文字で、前後の空白は取り除く", () => {
    expect(validateNickname("  もぐもぐ  ")).toEqual({ nickname: "もぐもぐ" });
    expect(validateNickname("あ")).toHaveProperty("error");
    expect(validateNickname("あ".repeat(17))).toHaveProperty("error");
  });
  it("運営を装う名前・URL・記号は使えない", () => {
    for (const n of ["ひとくち", "公式アカウント", "Admin太郎", "管理者です", "<script>", "http://x.jp", "a@b"]) expect(validateNickname(n)).toHaveProperty("error");
  });
  it("戻り先は自サイト内のパスだけ許可する（オープンリダイレクト対策）", () => {
    expect(safeReturnTo("/products/12?sort=new")).toBe("/products/12?sort=new");
    for (const v of ["https://evil.example/", "//evil.example", "/\\evil.example", "/auth/logout", "", null, undefined]) expect(safeReturnTo(v)).toBe("/");
  });
});

describe("口コミの自動チェック", () => {
  it("NG ワード・URL を含む口コミは要確認にする", () => {
    expect(needsReview("詳しくは https://example.com へ")).toBe(true);
    expect(needsReview("副業で稼げます")).toBe(true);
    expect(needsReview("クリームがたっぷりでおいしい")).toBe(false);
  });
});

describe("アフィリエイトリンク", () => {
  const s = { ads_enabled: false, adsense_client: "", adsense_slot: "", amazon_tag: "hitokuchi-22", rakuten_affiliate_id: "abc.123", operator_name: "", operator_contact: "", rakuten_ads_enabled: false, rakuten_ad_sp: "", rakuten_ad_pc: "" };
  it("通販で買えるカテゴリだけに出す", () => {
    expect(affiliateLinks(s, "ポテトチップス", "snack")).toHaveLength(2);
    expect(affiliateLinks(s, "生シュークリーム", "sweets")).toEqual([]);
    expect(affiliateLinks(s, "おにぎり", null)).toEqual([]);
  });
  it("ID を設定したサービスだけ出し、商品名は URL エンコードする", () => {
    const links = affiliateLinks({ ...s, rakuten_affiliate_id: "" }, "チョコ&ナッツ", "chocolate");
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe("https://www.amazon.co.jp/s?k=%E3%83%81%E3%83%A7%E3%82%B3%26%E3%83%8A%E3%83%83%E3%83%84&tag=hitokuchi-22");
  });
  it("設定が無ければ何も出さない", () => expect(affiliateLinks(undefined, "x", "snack")).toEqual([]));
});

describe("AI 要約", () => {
  it("口コミが 5 件たまるまでは作らない", () => {
    expect(needsSummary(4, 0)).toBe(false);
    expect(needsSummary(5, 0)).toBe(true);
  });
  it("保存された JSON が壊れていても落ちない", () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary("{こわれた")).toBeNull();
    expect(parseSummary(JSON.stringify({ summary: "甘さ控えめで好評", pros: ["クリームが濃厚"], cons: [] }))).toMatchObject({ summary: "甘さ控えめで好評" });
  });
});
