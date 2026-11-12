export const yen = (n: number | null | undefined) => (n == null ? "—" : `¥${n.toLocaleString("ja-JP")}`);

export function relativeDate(iso: string) {
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60 * 60) return `${Math.max(1, Math.floor(diff / 60))}分前`;
  if (diff < 60 * 60 * 24) return `${Math.floor(diff / 3600)}時間前`;
  if (diff < 60 * 60 * 24 * 30) return `${Math.floor(diff / 86400)}日前`;
  return d.toLocaleDateString("ja-JP");
}

export function isNew(releasedOn: string | null) {
  if (!releasedOn) return false;
  return Date.now() - new Date(releasedOn).getTime() < 1000 * 60 * 60 * 24 * 14;
}

export const imgUrl = (key: string | null) => (key ? `/img/${encodeURIComponent(key)}` : null);

const ALL_FM_REGIONS = ["北海道", "東北", "関東", "東海", "北陸", "関西", "中国・四国", "九州", "沖縄"];

/** 販売地域を一覧用の短い表記にする（例：「全国」「沖縄を除く全国」「関東・東海ほか3地域」） */
export function regionLabel(region: string | null | undefined) {
  if (!region) return null;
  const r = region.normalize("NFKC").replace(/^販売地域[:：]\s*/, "").trim();
  if (!r) return null;
  if (/^全国/.test(r)) return "全国";
  // 「※沖縄地域のローソンではお取り扱いしておりません。」のような除外表記
  const ex = r.match(/^※\s*([^、。]+?)(?:地域|県)の[^。]*(?:取り?扱|販売)[^。]*(?:おりません|ございません|ありません)/);
  if (ex) return `${ex[1]}を除く全国`;
  if (r.startsWith("※")) return null; // 地域ではない注記

  const parts = r.split(/[、,]/).map((s) => s.trim()).filter(Boolean);
  if (ALL_FM_REGIONS.every((a) => parts.includes(a))) return "全国";
  if (parts.length <= 2) return parts.join("・");
  return `${parts.slice(0, 2).join("・")}ほか${parts.length - 2}エリア`;
}

/** 発売日の短い表記（未来なら「発売予定」） */
export function releaseLabel(releasedOn: string | null | undefined) {
  if (!releasedOn) return null;
  const [, m, d] = releasedOn.split("-").map(Number);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return releasedOn > today ? `${m}/${d}発売予定` : `${m}/${d}発売`;
}
