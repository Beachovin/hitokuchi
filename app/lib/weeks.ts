// 週の表示用ヘルパー（クライアントでも使う）

/** 日付文字列（YYYY-MM-DD）→ その週の月曜日 */
export function mondayOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 月曜=0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 日本時間の今日 */
export const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);


export const CHAIN_ORDER = [
  { slug: "seven-eleven", name: "セブン-イレブン", color: "#f97316" },
  { slug: "familymart", name: "ファミリーマート", color: "#16a34a" },
  { slug: "lawson", name: "ローソン", color: "#0ea5e9" },
  { slug: "ministop", name: "ミニストップ", color: "#eab308" },
  { slug: "daily-yamazaki", name: "デイリーヤマザキ", color: "#dc2626" },
] as const;

const fmt = (d: string, withYear = false) => {
  const [y, m, day] = d.split("-").map(Number);
  return withYear ? `${y}年${m}月${day}日` : `${m}月${day}日`;
};

export function weekLabel(monday: string, sunday: string) {
  const sameYear = monday.slice(0, 4) === sunday.slice(0, 4);
  return `${fmt(monday, true)}〜${fmt(sunday, !sameYear)}`;
}

export function shortWeekLabel(monday: string, sunday: string) {
  return `${fmt(monday)}〜${fmt(sunday)}`;
}
