import { describe, expect, it } from "vitest";
import type { RawItem } from "../../workers/scrape/adapters";
import { cleanName, DUPLICATE_THRESHOLD, guessCategory, nameSimilarity, normalizeByRules, normalizeKey, parseDate, parseKcal, parsePrice } from "../../workers/scrape/normalize";

const raw = (o: Partial<RawItem>): RawItem => ({ externalId: "1", name: "テスト", url: "https://example.test/1", imageUrl: null, priceText: null, releaseText: null, region: null, categoryText: null, kcalText: null, description: null, ...o });

describe("価格の整形（税込の円にそろえる）", () => {
  it("「258円（税込278.64円）」は税込額の小数を切り捨てる", () => expect(parsePrice("258円（税込278.64円）")).toBe(278));
  it("「362円(税込)」はそのまま使う", () => expect(parsePrice("362円(税込)")).toBe(362));
  it("本体価格だけなら軽減税率 8% で換算する", () => expect(parsePrice("本体価格100円")).toBe(108));
  it("全角数字・カンマにも対応する", () => expect(parsePrice("１，２８０円（税込１，３８２．４０円）")).toBe(1382));
  it("価格が無ければ null", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice("オープン価格")).toBeNull();
  });
});

describe("発売日の整形", () => {
  const today = new Date("2026-11-12T00:00:00Z");
  it("年月日がそろっている表記", () => {
    expect(parseDate("2026年11月10日（火）以降順次発売", today)).toBe("2026-11-10");
    expect(parseDate("2026.11.03", today)).toBe("2026-11-03");
  });
  it("年が無いときは基準日に近い年を補う", () => {
    expect(parseDate("11/10", today)).toBe("2026-11-10");
    expect(parseDate("1月6日", today)).toBe("2027-01-06"); // 11 月に見た 1 月は翌年
    expect(parseDate("12/28", new Date("2027-01-05T00:00:00Z"))).toBe("2026-12-28"); // 1 月に見た 12 月は前年
  });
  it("日付でなければ null", () => {
    expect(parseDate("順次発売", today)).toBeNull();
    expect(parseDate("13/40", today)).toBeNull();
    expect(parseDate(null, today)).toBeNull();
  });
});

describe("商品名・カロリー", () => {
  it("先頭の【新発売】や（期間限定）を取り除く", () => {
    expect(cleanName("【新発売】　もちもち　どら焼き（期間限定）")).toBe("もちもち どら焼き");
  });
  it("全角英数を半角にそろえる", () => expect(cleanName("ＮＬ　ブランパン　２個入")).toBe("NL ブランパン 2個入"));
  it("カロリーの数字を取り出す", () => {
    expect(parseKcal("1個当たり291kcal")).toBe(291);
    expect(parseKcal(null)).toBeNull();
  });
});

describe("カテゴリ推定", () => {
  it("商品名から推定する", () => {
    expect(guessCategory("濃厚チョコレートケーキ", null)).not.toBeNull();
    expect(guessCategory("手巻おにぎり 紅しゃけ", null)).toBe("onigiri");
    expect(guessCategory("醤油ラーメン", null)).toBe("noodle");
  });
  it("過去に誤判定した商品名を正しく分類する", () => {
    expect(guessCategory("たまごっちグミ", null)).not.toBe("deli");
    expect(guessCategory("だし巻き玉子", null)).not.toBe("onigiri");
  });
  it("手がかりが無ければ null", () => expect(guessCategory("なぞの商品", null)).toBeNull());
});

describe("ルール整形（normalizeByRules）", () => {
  const today = new Date("2026-11-12T00:00:00Z");
  it("項目がそろうほど確信度が上がる", () => {
    const full = normalizeByRules(raw({ name: "ふわふわシュークリーム", priceText: "200円（税込216円）", releaseText: "2026年11月10日", imageUrl: "https://img.example.test/a.jpg" }), today);
    const bare = normalizeByRules(raw({ name: "なぞの商品" }), today);
    expect(full).toMatchObject({ price: 216, releasedOn: "2026-11-10", isFood: true });
    expect(full.confidence).toBeGreaterThan(bare.confidence);
    expect(full.confidence).toBeLessThanOrEqual(0.95);
  });
  it("食品以外（グッズ・くじ等）は除外対象にする", () => {
    expect(normalizeByRules(raw({ name: "パンどろぼう アクリルキーホルダー" }), today).isFood).toBe(false);
    expect(normalizeByRules(raw({ name: "オリジナルタオル", categoryText: "雑貨" }), today).isFood).toBe(false);
  });
  it("雑貨カテゴリでもグミなどの食玩は食品として残す", () => {
    expect(normalizeByRules(raw({ name: "キャラクターグミ", categoryText: "くじ・雑貨" }), today).isFood).toBe(true);
  });
  it("販売地域の「販売地域：」を取り除く", () => {
    expect(normalizeByRules(raw({ region: "販売地域：関東、東海" }), today).region).toBe("関東、東海");
  });
});

describe("重複判定（名前の似ている度合い）", () => {
  it("記号・空白・全角半角の違いは同じとみなす", () => {
    expect(normalizeKey("もっちり　たい焼き（カスタード）")).toBe(normalizeKey("もっちりたい焼きカスタード"));
    expect(nameSimilarity("ＮＬ ブランパン 2個入", "NLブランパン2個入")).toBe(1);
  });
  it("表記ゆれ程度の違いは重複とみなす", () => {
    expect(nameSimilarity("北海道スフレチーズケーキ キャラメル", "北海道スフレチーズケーキ キャラメル 1個")).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });
  it("味違い・別商品は重複とみなさない", () => {
    expect(nameSimilarity("もっちりたい焼き カスタード", "もっちりたい焼き つぶあん")).toBeLessThan(DUPLICATE_THRESHOLD);
    expect(nameSimilarity("ハムたまごサンド", "辛ねぎ味噌ラーメン")).toBeLessThan(0.2);
  });
  it("1 文字以下の名前でも落ちない", () => expect(nameSimilarity("あ", "い")).toBe(0));
});
