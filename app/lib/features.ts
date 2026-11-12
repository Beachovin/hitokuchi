// 地域別の新商品リストと、管理画面で作る特集の定義（クライアントでも使う）

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
