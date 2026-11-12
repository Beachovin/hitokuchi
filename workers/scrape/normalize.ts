import type { RawItem } from "./adapters";

// ルールベースの整形（Claude を使わない場合もこれだけで承認待ちに入れられる品質にする）

export type CategorySlug = "sweets" | "snack" | "chocolate" | "bread" | "onigiri" | "drink" | "ice" | "noodle" | "deli";

export const CATEGORY_SLUGS: CategorySlug[] = ["sweets", "snack", "chocolate", "bread", "onigiri", "drink", "ice", "noodle", "deli"];

export type Normalized = {
  externalId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  price: number | null;      // 税込（円・切り捨て）
  kcal: number | null;
  releasedOn: string | null; // YYYY-MM-DD
  region: string | null;
  category: CategorySlug | null;
  description: string | null;
  isFood: boolean;
  confidence: number;
};

/** 商品名の表記揺れを整える */
export function cleanName(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\s　]+/g, " ")
    .replace(/^(【[^】]*】|［[^］]*］|\[[^\]]*\])\s*/g, "") // 先頭の【新発売】等
    .replace(/[（(](新発売|リニューアル|期間限定|数量限定)[）)]/g, "")
    .replace(/\s*([（(])\s*/g, "$1")
    .replace(/\s*([）)])/g, "$1")
    .trim();
}

/** "258円（税込278.64円）" / "本体価格108円<br>(税込116.64円)" / "362円(税込)" → 税込の円 */
export function parsePrice(s: string | null) {
  if (!s) return null;
  const t = s.normalize("NFKC").replace(/,/g, "");
  const inc = t.match(/税込\s*([\d.]+)\s*円/);
  if (inc) return Math.floor(Number(inc[1]));
  const nums = [...t.matchAll(/([\d.]+)\s*円/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  if (/税込/.test(t)) return Math.floor(nums[0]); // "362円(税込)"
  return Math.floor(nums[0] * 1.08); // 本体価格のみ → 軽減税率 8% で換算
}

/** 発売日表記 → YYYY-MM-DD。年が無い場合は基準日に最も近い年を補う */
export function parseDate(s: string | null, today = new Date()) {
  if (!s) return null;
  const t = s.normalize("NFKC");
  let y: number | undefined, m: number | undefined, d: number | undefined;
  const full = t.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/);
  if (full) [y, m, d] = [Number(full[1]), Number(full[2]), Number(full[3])];
  else {
    const md = t.match(/(\d{1,2})\s*[月/]\s*(\d{1,2})/);
    if (!md) return null;
    [m, d] = [Number(md[1]), Number(md[2])];
    y = today.getFullYear();
    const diffDays = (Date.UTC(y, m - 1, d) - today.getTime()) / 86400000;
    if (diffDays > 180) y -= 1; // 1 月に前年 12 月の表記を見た場合など
    if (diffDays < -180) y += 1;
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseKcal(s: string | null) {
  if (!s) return null;
  const t = s.normalize("NFKC").replace(/,/g, "");
  // 「1個当たり291kcal」のように他の数字が混じるときは kcal の直前の数字を優先する
  const n = Number(t.match(/([\d.]+)\s*kcal/i)?.[1] ?? t.match(/[\d.]+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// サイト上のカテゴリ表記 → 自サイトのカテゴリ
const SITE_CATEGORY: [RegExp, CategorySlug][] = [
  [/おむすび|おにぎり|寿司|お弁当|弁当|丼|ごはん/, "onigiri"],
  [/パン|サンドイッチ|ロール|デニッシュ/, "bread"],
  [/麺|ラーメン|うどん|そば|パスタ/, "noodle"],
  [/アイス|フローズン/, "ice"],
  [/デザート|スイーツ|和菓子|洋菓子/, "sweets"],
  [/チョコ/, "chocolate"],
  [/菓子|スナック/, "snack"],
  [/飲料|ドリンク|コーヒー|カフェ|お茶|ティー|酒/, "drink"],
  [/惣菜|おかず|サラダ|スープ|ホットスナック|揚げ物|おでん|中華まん/, "deli"],
];

// 商品名のキーワード → カテゴリ（上から優先）
const NAME_CATEGORY: [RegExp, CategorySlug][] = [
  [/おむすび|おにぎり|むすび|にぎりめし|手巻|直巻|弁当|丼|重(\(|$|\s)|寿司|いなり|(?<!だし)巻き|太巻|キンパ|炒飯|チャーハン|ライス|ドリア|グラタン|ごはん|御飯|ボルガ/, "onigiri"],
  [/ラーメン|らーめん|うどん|そば|蕎麦|焼そば|焼きそば|パスタ|スパゲ|ナポリタン|アラビアータ|ペペロンチーノ|カルボナーラ|冷麺|担々麺|麺/, "noodle"],
  [/アイス|ソフト|フラッペ|シャーベット|ジェラート|かき氷|パフェ|ハロハロ|バー$/, "ice"],
  [/パン|デニッシュ|クロワッサン|ブレッド|サンド|ロール(?!ケーキ)|ベーグル|マフィン|ドーナツ|フランス|メロンパン|バーガー|ドッグ|ピザ|まん$|中華まん/, "bread"],
  [/ラテ|ティー|茶|コーヒー|珈琲|ジュース|ドリンク|スムージー|ミルク$|ソーダ|カフェオレ|エード/, "drink"],
  [/ケーキ|プリン|シュークリーム|(?<!チャー)シュー(?!マイ)|タルト|クレープ|ワッフル|大福|団子|だんご|餅|もち|どら焼|羊羹|ようかん|マカロン|トゥンカロン|ゼリー|ムース|ティラミス|モンブラン|わらび|パイ|エクレア|スイーツ|ぜんざい|おはぎ|たい焼|どらもっち|ブリュレ|カヌレ/, "sweets"],
  [/チョコ|ショコラ|カカオ/, "chocolate"],
  [/唐揚|から揚|からあげ|チキン|コロッケ|メンチ|フランク|ナムル|煮$|煮(\s|物)|炒め|サラダ|鍋|スープ|チャウダー|豆腐|つくね|餃子|焼売|シュウマイ|シューマイ|ブリトー|タコス|春巻|おでん|惣菜|白菜|ステーキ|ハンバーグ|ケバブ|マッケンチーズ|味付けたまご|味付たまご|ゆでたまご|玉子焼|だし巻|干物|焼鳥|焼き鳥/, "deli"],
  [/ハイボール|ウイスキー|カスク|ビール|ワイン|サワー|チューハイ|酎ハイ|シングルモルト|日本酒|梅酒/, "drink"],
  [/チップス|スナック|ポテト|グミ|ウエハース|クッキー|ビスケット|せんべい|あられ|ナッツ|キャンディ|ガム|プレッツェル|クリスピー|梅$/, "snack"],
];

const NON_FOOD = /洗剤|シャンプー|マスク|靴下|ソックス|タオル|電池|充電|ケーブル|文具|ノート|化粧|コスメ|リップ|ハンドクリーム|雑誌|コミック|ギフトカード|プリペイド|たばこ|タバコ|くじ|アクリル|クリアカード|フィギュア|ぬいぐるみ|キーホルダー|ポーチ|缶バッジ|ステッカー|グッズ|バズコレ|ソックス|インポーチ|ピクミン/;

const NON_FOOD_CATEGORY = /ウェア|雑貨|くじ|日用品|化粧品|書籍|雑誌|チケット/;
const FOOD_HINT = /グミ|せんべい|ガム|ウエハース|チョコ|クッキー|キャンディ|ラムネ|スナック/;

export function guessCategory(name: string, siteCategory: string | null): CategorySlug | null {
  for (const [re, slug] of SITE_CATEGORY) if (siteCategory && re.test(siteCategory)) return slug;
  for (const [re, slug] of NAME_CATEGORY) if (re.test(name)) return slug;
  return null;
}

export function normalizeByRules(item: RawItem, today = new Date()): Normalized {
  const name = cleanName(item.name);
  const price = parsePrice(item.priceText);
  const releasedOn = parseDate(item.releaseText, today);
  const category = guessCategory(name, item.categoryText);
  // 「くじ・雑貨」カテゴリでもグミ・せんべい等の食玩は食品として扱う
  const isFood =
    !NON_FOOD.test(name) && !(item.categoryText && NON_FOOD_CATEGORY.test(item.categoryText) && !FOOD_HINT.test(name));
  // 取れた項目が多いほど確信度を上げる
  let confidence = 0.5;
  if (price) confidence += 0.15;
  if (releasedOn) confidence += 0.1;
  if (category) confidence += 0.15;
  if (item.imageUrl) confidence += 0.05;
  if (!isFood) confidence = 0.2;
  return {
    externalId: item.externalId,
    name,
    url: item.url,
    imageUrl: item.imageUrl,
    price,
    kcal: parseKcal(item.kcalText),
    releasedOn,
    region: item.region ? item.region.normalize("NFKC").replace(/^販売地域[:：]\s*/, "").slice(0, 200) : null,
    category,
    description: item.description ? item.description.normalize("NFKC").trim().slice(0, 200) : null,
    isFood,
    confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
  };
}

/** 重複判定用に商品名を正規化 */
export function normalizeKey(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s・･\-ー〜~！!？?「」『』（）()【】\[\]、。,.]/g, "");
}

/**
 * 商品名の似ている度合い（0〜1）。正規化した名前の 2 文字ずつの重なり（Dice 係数）。
 * 「〜 2 個入」「〜（ローソン限定）」など表記ゆれ程度の違いなら 0.8 以上になる。
 */
export function nameSimilarity(a: string, b: string) {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let hit = 0;
  for (const [g, n] of gx) hit += Math.min(n, gy.get(g) ?? 0);
  return (2 * hit) / (x.length - 1 + (y.length - 1));
}

/** 重複とみなす似ている度合い */
export const DUPLICATE_THRESHOLD = 0.85;
