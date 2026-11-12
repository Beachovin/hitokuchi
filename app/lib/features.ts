// 地域・季節の特集（クライアントでも使う定義）

export const AREAS = [
  { slug: "hokkaido", name: "北海道", emoji: "🐻", keys: ["北海道"] },
  { slug: "tohoku", name: "東北", emoji: "🍎", keys: ["東北", "青森", "岩手", "宮城", "秋田", "山形", "福島"] },
  { slug: "kanto", name: "関東", emoji: "🗼", keys: ["関東", "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川"] },
  { slug: "chubu", name: "甲信越・北陸", emoji: "🏔️", keys: ["甲信越", "北陸", "新潟", "富山", "石川", "福井", "山梨", "長野"] },
  { slug: "tokai", name: "東海", emoji: "🗻", keys: ["東海", "岐阜", "静岡", "愛知", "三重"] },
  { slug: "kinki", name: "近畿", emoji: "🏯", keys: ["近畿", "関西", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山"] },
  { slug: "chugoku-shikoku", name: "中国・四国", emoji: "🍊", keys: ["中国", "四国", "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知"] },
  { slug: "kyushu", name: "九州", emoji: "🌋", keys: ["九州", "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島"] },
  { slug: "okinawa", name: "沖縄", emoji: "🌺", keys: ["沖縄"] },
] as const;

/** 販売地域の文字列から該当エリアを判定。全国販売・「〜を除く」は限定扱いしない */
export function limitedAreas(region: string | null | undefined) {
  if (!region) return [];
  const r = region.normalize("NFKC");
  if (/全国|^※/.test(r)) return [];
  const hit = AREAS.filter((a) => a.keys.some((k) => r.includes(k)));
  return hit.length >= 1 && hit.length <= 3 ? hit.map((a): string => a.slug) : [];
}

export type Season = {
  slug: string;
  title: string;
  lead: string;
  emoji: string;
  months: number[]; // 空なら通年
  pattern: RegExp;
  gradient: string;
};

export const SEASONS: Season[] = [
  { slug: "autumn-sweets", title: "秋の味覚スイーツ", lead: "栗・芋・かぼちゃ・りんご。秋だけのご褒美をまとめました。", emoji: "🌰", months: [9, 10, 11], pattern: /栗|マロン|モンブラン|芋|いも|焼き芋|かぼちゃ|南瓜|パンプキン|りんご|林檎|アップル|梨|ぶどう|葡萄/, gradient: "from-amber-500 to-orange-600" },
  { slug: "winter-warm", title: "冬のあったかグルメ", lead: "鍋・スープ・中華まん。寒い日に食べたい新商品。", emoji: "🍲", months: [11, 12, 1, 2], pattern: /鍋|スープ|まん|グラタン|ドリア|おでん|シチュー|あったか|ポタージュ|雑炊|うどん|ラーメン|チャウダー/, gradient: "from-rose-500 to-red-700" },
  { slug: "spring-sakura", title: "春の桜・いちごフェア", lead: "桜といちごの季節限定商品。", emoji: "🌸", months: [2, 3, 4], pattern: /桜|さくら|サクラ|苺|いちご|イチゴ|ストロベリー/, gradient: "from-pink-400 to-rose-500" },
  { slug: "summer-cool", title: "夏のひんやり特集", lead: "冷たいスイーツ・麺・ドリンクで暑さをしのごう。", emoji: "🧊", months: [6, 7, 8, 9], pattern: /冷|ひんやり|アイス|ゼリー|レモン|フラッペ|かき氷|そうめん|冷やし|シャーベット|ソーダ/, gradient: "from-sky-400 to-cyan-600" },
  { slug: "korean", title: "韓国グルメ特集", lead: "キンパ・ビビンバ・ヤンニョム。コンビニで楽しむ韓国の味。", emoji: "🇰🇷", months: [], pattern: /韓国|キンパ|ビビンバ|タッカルビ|ヤンニョム|チュモッパ|トッポギ|プルコギ|ナムル|コチュジャン|チヂミ/, gradient: "from-red-500 to-indigo-600" },
  { slug: "chocolate", title: "チョコレート好きに捧ぐ", lead: "チョコ・ショコラ・カカオの新作を集めました。", emoji: "🍫", months: [], pattern: /チョコ|ショコラ|カカオ|ガナッシュ|ブラウニー/, gradient: "from-amber-800 to-stone-900" },
];

export const inSeason = (s: Season, month: number) => s.months.length === 0 || s.months.includes(month);

// 管理画面で作る特集のテーマ色
export const THEMES = [
  { id: "sunset", label: "夕焼け", gradient: "from-amber-500 to-orange-600" },
  { id: "sakura", label: "さくら", gradient: "from-pink-400 to-rose-500" },
  { id: "matcha", label: "抹茶", gradient: "from-lime-500 to-emerald-600" },
  { id: "sky", label: "空", gradient: "from-sky-400 to-cyan-600" },
  { id: "grape", label: "ぶどう", gradient: "from-violet-500 to-fuchsia-600" },
  { id: "choco", label: "チョコ", gradient: "from-amber-800 to-stone-900" },
  { id: "night", label: "夜", gradient: "from-indigo-600 to-slate-900" },
] as const;
export const themeGradient = (id: string) => THEMES.find((t) => t.id === id)?.gradient ?? THEMES[0].gradient;
export const FEATURE_EMOJIS = ["🍙", "🍰", "🍫", "🥐", "🍜", "🍨", "🧋", "🍗", "🌸", "🌰", "🎃", "🎄", "❄️", "☀️", "🍓", "🍋", "🧀", "🔥", "✨", "🏆"];
