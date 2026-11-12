import { tierOf, type ReviewerStats } from "~/lib/reviewer-tier";
import { demographicLabel } from "~/lib/profile";

const RING: Record<string, string> = {
  rookie: "",
  bronze: "bg-gradient-to-br from-amber-600 via-orange-300 to-amber-800",
  silver: "bg-gradient-to-br from-slate-300 via-white to-slate-500",
  gold: "bg-gradient-to-br from-yellow-300 via-amber-500 to-yellow-600 shadow-[0_0_16px_rgba(245,158,11,.55)]",
  platinum: "tier-platinum-ring shadow-[0_0_20px_rgba(167,139,250,.6)]",
};

const NAME: Record<string, string> = {
  rookie: "",
  bronze: "text-amber-800 dark:text-amber-400",
  silver: "text-slate-600 dark:text-slate-300",
  gold: "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 bg-clip-text text-transparent",
  platinum: "tier-platinum-text bg-clip-text text-transparent",
};

const CHIP: Record<string, string> = {
  rookie: "",
  bronze: "bg-gradient-to-r from-amber-700 to-orange-500 text-white",
  silver: "bg-gradient-to-r from-slate-400 to-slate-600 text-white",
  gold: "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-amber-950",
  platinum: "tier-platinum-chip text-white",
};

/** レビュアーのアバター（ランクに応じて縁取りが変わる） */
export function ReviewerAvatar({ nickname, stats, size = 40, src }: { nickname: string; stats?: ReviewerStats | null; size?: number; src?: string | null }) {
  const t = tierOf(stats);
  const d = size - (t.id === "rookie" ? 0 : 5);
  const inner = src ? (
    <img src={src} alt="" loading="lazy" className="rounded-full object-cover" style={{ width: d, height: d }} />
  ) : (
    <span
      className="grid place-items-center rounded-full bg-gradient-to-br from-brand-100 to-rose-100 font-bold text-brand-600 dark:from-stone-800 dark:to-stone-700 dark:text-brand-300"
      style={{ width: size - (t.id === "rookie" ? 0 : 5), height: size - (t.id === "rookie" ? 0 : 5), fontSize: size * 0.4 }}
    >
      {nickname.slice(0, 1)}
    </span>
  );
  if (t.id === "rookie") return <span className="shrink-0">{inner}</span>;
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full p-[2.5px] ${RING[t.id]}`} style={{ width: size, height: size }}>
      <span className="grid place-items-center rounded-full bg-white dark:bg-stone-900">{inner}</span>
      {t.icon && (
        <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] shadow ring-1 ring-black/5 dark:bg-stone-800" aria-hidden>
          {t.icon}
        </span>
      )}
    </span>
  );
}

/** ニックネーム＋ランク表示 */
export function ReviewerName({
  nickname,
  stats,
  showStats = true,
  ageGroup,
  gender,
  isDemo,
}: {
  nickname: string;
  stats?: ReviewerStats | null;
  showStats?: boolean;
  ageGroup?: string | null;
  gender?: string | null;
  isDemo?: boolean;
}) {
  const t = tierOf(stats);
  const demo = demographicLabel(ageGroup, gender);
  return (
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`truncate text-sm font-bold ${NAME[t.id]}`}>{nickname}</span>
        {t.id !== "rookie" && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide ${CHIP[t.id]}`} title={`${t.points}ポイント`}>
            {t.icon} {t.label}
          </span>
        )}
        {isDemo && <span className="rounded border border-dashed border-stone-300 px-1 text-[9px] font-bold text-stone-400" title="表示確認用のデモデータです">デモ</span>}
      </span>
      {demo && <span className="block text-[11px] text-stone-500 dark:text-stone-400">{demo}</span>}
      {showStats && stats && stats.review_count > 0 && (
        <span className="block text-[11px] text-stone-400">
          口コミ{stats.review_count}件 ・ Good {stats.good_received}
        </span>
      )}
    </span>
  );
}

export function tierCardClass(stats?: ReviewerStats | null) {
  const t = tierOf(stats).id;
  if (t === "platinum") return "tier-platinum-card";
  if (t === "gold") return "ring-2 ring-amber-300/70 dark:ring-amber-400/40 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-500/[0.06] dark:to-stone-900";
  return "";
}
