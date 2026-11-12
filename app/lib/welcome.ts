// はじめて来た人向けの案内（ようこそガイド）を、どこで・どの形で出すかの判定

/** ガイドを見た（閉じた）ことを覚えておくキー。中身を大きく変えたら番号を上げると、全員にもう一度表示される */
export const WELCOME_SEEN_KEY = "hk_welcome_v1";

/** ガイドを開くためのイベント（「使い方を見る」ボタンなどから発火） */
export const OPEN_WELCOME_EVENT = "hk:open-welcome";

export type WelcomeMode = "modal" | "banner" | null;

/** 案内を出さないページ（読んでいる最中の説明ページや、手続きの途中） */
const QUIET_PATHS = [/^\/about/, /^\/terms/, /^\/privacy/, /^\/login/, /^\/mypage/, /^\/post/, /^\/notifications/, /^\/favorites/];

/**
 * - トップに初めて来た人 → 全体の説明（modal）
 * - 検索などから商品ページ等に直接来た人 → 読みたいページを隠さないよう、下に小さな案内（banner）
 * - 一度閉じた人・ログイン中の人・検索エンジン等のボット → 出さない
 */
export function welcomeMode(o: { pathname: string; seen: boolean; loggedIn: boolean; bot: boolean }): WelcomeMode {
  if (o.seen || o.loggedIn || o.bot) return null;
  if (QUIET_PATHS.some((re) => re.test(o.pathname))) return null;
  return o.pathname === "/" ? "modal" : "banner";
}

/** ガイドの各ページ */
export const WELCOME_STEPS = [
  {
    emoji: "🍙",
    title: "ひとくちへ、ようこそ",
    body: "セブン・ファミマ・ローソン・ミニストップ・デイリーヤマザキの新商品を毎朝まとめて、実際に食べた人の口コミでチェックできるサイトです。",
    points: [] as { icon: string; text: string }[],
  },
  {
    emoji: "✨",
    title: "こんなふうに使えます",
    body: "",
    points: [
      { icon: "🔍", text: "今週・来週の新商品をチェーン別に見る" },
      { icon: "⭐", text: "買う前に、みんなの口コミと評価を読む" },
      { icon: "❤️", text: "「気になる」に入れると、発売日にお知らせ" },
      { icon: "⚔️", text: "週ごとの新商品バトルに投票する" },
    ],
  },
  {
    emoji: "✍️",
    title: "食べたら、ひとくち感想を",
    body: "見るだけならログインは不要です。口コミや「気になる」は Google アカウントでログインすると使えます。表示されるのはニックネームだけで、メールアドレスは公開されません。",
    points: [],
  },
] as const;
