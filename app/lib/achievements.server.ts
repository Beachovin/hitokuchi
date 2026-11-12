import { notify } from "./engage.server";
import { addDays, mondayOf, todayJst } from "./weeks";

// 実績バッジ（データから都度計算する。解除時に通知を出す）

export type Achievement = { id: string; icon: string; name: string; desc: string; progress: number; goal: number; unlocked: boolean };

type Def = Omit<Achievement, "progress" | "unlocked"> & { metric: keyof Metrics };
type Metrics = {
  reviews: number;
  chains: number;
  sweets: number;
  onigiri: number;
  bread: number;
  noodle: number;
  firsts: number;
  goods: number;
  streak: number;
  favorites: number;
};

const DEFS: Def[] = [
  { id: "first_bite", icon: "🍙", name: "はじめのひとくち", desc: "はじめて口コミを書く", goal: 1, metric: "reviews" },
  { id: "regular", icon: "🏠", name: "常連さん", desc: "口コミを10件書く", goal: 10, metric: "reviews" },
  { id: "master", icon: "🎓", name: "レビューの達人", desc: "口コミを50件書く", goal: 50, metric: "reviews" },
  { id: "five_chains", icon: "🗾", name: "コンビニ5社制覇", desc: "5社すべての商品に口コミを書く", goal: 5, metric: "chains" },
  { id: "sweets_hunter", icon: "🍰", name: "スイーツハンター", desc: "スイーツの口コミを10件書く", goal: 10, metric: "sweets" },
  { id: "onigiri_boss", icon: "🍙", name: "おにぎり番長", desc: "おにぎり・弁当の口コミを10件書く", goal: 10, metric: "onigiri" },
  { id: "bread_lover", icon: "🥐", name: "パン好き", desc: "パンの口コミを10件書く", goal: 10, metric: "bread" },
  { id: "noodle_club", icon: "🍜", name: "麺すすり隊", desc: "麺類の口コミを5件書く", goal: 5, metric: "noodle" },
  { id: "pioneer", icon: "🥇", name: "一番乗り", desc: "ファーストレビューを獲得する", goal: 1, metric: "firsts" },
  { id: "frontier", icon: "🚀", name: "フロンティア", desc: "ファーストレビューを5回獲得する", goal: 5, metric: "firsts" },
  { id: "helpful", icon: "📚", name: "みんなの参考書", desc: "Good を合計50もらう", goal: 50, metric: "goods" },
  { id: "streak4", icon: "🔥", name: "4週連続投稿", desc: "4週連続で口コミを書く", goal: 4, metric: "streak" },
  { id: "collector", icon: "❤️", name: "気になるコレクター", desc: "「気になる」に20件登録する", goal: 20, metric: "favorites" },
];

async function metrics(db: D1Database, userId: string): Promise<Metrics> {
  const m = await db
    .prepare(
      `SELECT
         COUNT(*) AS reviews,
         SUM(c.slug = 'sweets') AS sweets, SUM(c.slug = 'onigiri') AS onigiri, SUM(c.slug = 'bread') AS bread, SUM(c.slug = 'noodle') AS noodle,
         SUM(r.is_first) AS firsts, COALESCE(SUM(r.good_count), 0) AS goods,
         (SELECT COUNT(DISTINCT pc.channel_id) FROM reviews r2 JOIN product_channels pc ON pc.product_id = r2.product_id WHERE r2.reviewer_id = ?1 AND r2.status = 'published') AS chains,
         (SELECT COUNT(*) FROM bookmarks b WHERE b.user_id = ?1) AS favorites
       FROM reviews r JOIN products p ON p.id = r.product_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE r.reviewer_id = ?1 AND r.status = 'published'`,
    )
    .bind(userId)
    .first<Record<string, number | null>>();
  // 連続投稿週数（今週または先週から遡って数える）
  const { results } = await db
    .prepare("SELECT DISTINCT date(created_at, '+9 hours', '-6 days', 'weekday 1') AS w FROM reviews WHERE reviewer_id = ? AND status = 'published' ORDER BY w DESC LIMIT 60")
    .bind(userId)
    .all<{ w: string }>();
  const weeks = new Set(results.map((r) => r.w));
  let cursor = mondayOf(todayJst());
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  const n = (k: string) => Number(m?.[k] ?? 0);
  return {
    reviews: n("reviews"), chains: n("chains"), sweets: n("sweets"), onigiri: n("onigiri"), bread: n("bread"), noodle: n("noodle"),
    firsts: n("firsts"), goods: n("goods"), streak, favorites: n("favorites"),
  };
}

export async function getAchievements(db: D1Database, userId: string): Promise<Achievement[]> {
  const m = await metrics(db, userId);
  return DEFS.map(({ metric, ...d }) => ({ ...d, progress: Math.min(m[metric], d.goal), unlocked: m[metric] >= d.goal }));
}

/** 新しく解除した実績を通知（同じ実績の通知は UNIQUE 制約で 1 回だけ） */
export async function notifyNewAchievements(db: D1Database, userId: string) {
  const list = await getAchievements(db, userId);
  for (const a of list.filter((x) => x.unlocked)) {
    await notify(db, { userId, kind: "achievement", ref: a.id, body: `実績「${a.icon} ${a.name}」を解除しました！`, link: "/mypage#achievements" });
  }
}
