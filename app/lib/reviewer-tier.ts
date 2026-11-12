// レビュアーのランク（口コミ数と、もらった Good / Bad から算出）

export type TierId = "rookie" | "bronze" | "silver" | "gold" | "platinum";

export type ReviewerStats = { review_count: number; good_received: number; bad_received: number; first_count?: number };

export const TIERS: { id: TierId; label: string; min: number; icon: string }[] = [
  { id: "platinum", label: "プラチナレビュアー", min: 200, icon: "💎" },
  { id: "gold", label: "ゴールドレビュアー", min: 80, icon: "👑" },
  { id: "silver", label: "シルバーレビュアー", min: 30, icon: "🥈" },
  { id: "bronze", label: "ブロンズレビュアー", min: 10, icon: "🥉" },
  { id: "rookie", label: "レビュアー", min: 0, icon: "" },
];

/** ポイント = 口コミ数×3 + Good×2 + ファーストレビュー×5 − Bad */
export const FIRST_REVIEW_BONUS = 5;
export function reviewerPoints(s: ReviewerStats) {
  return Math.max(0, s.review_count * 3 + s.good_received * 2 + (s.first_count ?? 0) * FIRST_REVIEW_BONUS - s.bad_received);
}

export function tierOf(s: ReviewerStats | null | undefined) {
  const pts = s ? reviewerPoints(s) : 0;
  const tier = TIERS.find((t) => pts >= t.min)!;
  const next = [...TIERS].reverse().find((t) => t.min > pts) ?? null;
  return { ...tier, points: pts, next };
}
