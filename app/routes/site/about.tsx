import { Link, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/about";
import { LogoMark } from "~/components/logo";
import { openWelcome } from "~/components/welcome";
import { TIERS } from "~/lib/reviewer-tier";
import { CHAIN_ORDER } from "~/lib/weeks";

export const meta: Route.MetaFunction = () => [
  { title: "ひとくちとは｜コンビニ新商品の口コミサイト" },
  { name: "description", content: "ひとくちは、コンビニ5社の新商品を毎朝まとめて、実際に食べた人の口コミでチェックできるサイトです。使い方とよくある質問。" },
  { property: "og:title", content: "ひとくちとは｜コンビニ新商品の口コミサイト" },
  { property: "og:type", content: "website" },
];

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-12 font-display text-2xl font-black text-stone-900 dark:text-white">{children}</h2>;

const FEATURES = [
  { icon: "🗓️", title: "毎朝、新商品をまとめて掲載", body: "各社が公開している新商品情報を毎朝確認し、今週・来週の新商品をチェーン別にまとめます。" },
  { icon: "⭐", title: "食べた人の口コミ", body: "総合評価に加えて、味・量・コスパの3つの観点で評価できます。星とひとことだけの「ひとこと口コミ」も。" },
  { icon: "❤️", title: "気になる・お知らせ", body: "気になる商品を登録すると、発売日当日にお知らせします。食べたあとは口コミのお願いも届きます。" },
  { icon: "⚔️", title: "新商品バトル", body: "毎週、ジャンルごとに注目の新商品どうしの対決を用意。どっちが気になるか投票できます（1人1回）。" },
  { icon: "🗾", title: "地域限定の商品", body: "その地域でしか買えない新商品を、エリア別にまとめています。" },
  { icon: "🏅", title: "レビュアーランク・実績", body: "口コミを書いたり、Good をもらったりするとポイントがたまり、ランクが上がります。" },
];

const FAQ = [
  { q: "利用は無料ですか？", a: "すべての機能を無料で使えます。サイトは広告とアフィリエイト（通販リンク）の収益で運営しています。" },
  { q: "ログインしないと使えませんか？", a: "商品や口コミを見る、検索する、バトルに投票するのはログインなしでできます。口コミの投稿、Good / Bad、「気になる」、お知らせを使うには Google アカウントでのログインが必要です。" },
  { q: "メールアドレスや本名は公開されますか？", a: "公開されません。口コミに表示されるのは、ご自身で決めたニックネームだけです。年代・性別は、設定で「公開する」を選んだ場合だけ表示されます。" },
  { q: "商品の情報はどこから来ていますか？", a: "各社の公式サイトで公開されている新商品情報をもとに、自動で掲載しています。価格は税込で表示しています。最新の情報は各社の公式サイトや店頭でご確認ください。" },
  { q: "古い商品が見つかりません", a: "ひとくちは「いま買える新商品」に絞ったサイトのため、発売から約1か月を過ぎた商品は、口コミとともに自動で掲載を終了します。" },
  { q: "自分の口コミを消したい・退会したい", a: "マイページから口コミの削除や退会ができます。退会すると、アカウントと口コミはすべて削除されます。" },
  { q: "不適切な口コミを見つけました", a: "各口コミの「通報」からお知らせください。運営で確認し、利用規約に反するものは非公開にします。" },
];

export default function About() {
  const root = useRouteLoaderData<{ viewer: unknown }>("root");
  return (
    <article className="mx-auto max-w-3xl px-4 pt-4 leading-relaxed text-stone-700 md:pt-10 dark:text-stone-300">
      <div className="flex items-center gap-4">
        <LogoMark size={64} />
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-brand-500">ABOUT</p>
          <h1 className="font-display text-3xl font-black text-stone-900 sm:text-4xl dark:text-white">ひとくちとは</h1>
        </div>
      </div>
      <p className="mt-6 text-lg font-bold text-stone-900 dark:text-white">買う前に、みんなの「ひとくち」を。</p>
      <p className="mt-2">
        ひとくちは、{CHAIN_ORDER.map((c) => c.name).join("・")}の新商品を毎朝まとめて、実際に食べた人の口コミでチェックできるサイトです。
        「新商品、気になるけど当たりかな？」を、食べた人の声で確かめられます。
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={openWelcome} className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900">
          かんたんな使い方を見る
        </button>
        <Link to="/" className="rounded-full px-5 py-2.5 text-sm font-bold text-stone-700 ring-1 ring-stone-200 hover:bg-white dark:text-stone-200 dark:ring-white/15 dark:hover:bg-white/5">
          新商品を見る
        </Link>
      </div>

      <H>できること</H>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-3xl bg-white p-5 ring-1 ring-cream-200 dark:bg-stone-900 dark:ring-white/10">
            <p className="text-2xl" aria-hidden>{f.icon}</p>
            <p className="mt-2 font-bold text-stone-900 dark:text-white">{f.title}</p>
            <p className="mt-1 text-sm">{f.body}</p>
          </div>
        ))}
      </div>

      <H>はじめかた</H>
      <ol className="mt-4 space-y-3">
        {[
          ["ホームで今週の新商品を見る", "チェーンのアイコンをタップすると、そのお店の新商品だけを見られます。"],
          ["気になる商品に ❤️ を付ける", "発売日にお知らせが届きます（ログインが必要です）。"],
          ["食べたら口コミを書く", "星だけの「ひとこと口コミ」なら10秒で書けます。発売から3日以内の最初の口コミは「ファーストレビュー」としてボーナスポイントがもらえます。"],
        ].map(([t, b], i) => (
          <li key={t} className="flex gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-black text-white">{i + 1}</span>
            <span>
              <span className="block font-bold text-stone-900 dark:text-white">{t}</span>
              <span className="text-sm">{b}</span>
            </span>
          </li>
        ))}
      </ol>
      {!root?.viewer && (
        <Link to="/login" className="mt-6 inline-block rounded-full bg-gradient-to-br from-amber-400 to-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-brand-500/30 hover:brightness-105">
          Google でログインして始める
        </Link>
      )}

      <H>レビュアーランク</H>
      <p className="mt-3 text-sm">ポイント ＝ 口コミの数 × 3 ＋ もらった Good × 2 ＋ ファーストレビュー × 5（もらった Bad の分だけ減ります）</p>
      <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-cream-200 dark:ring-white/10">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-cream-200 bg-white dark:divide-white/10 dark:bg-stone-900">
            {[...TIERS].reverse().map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2.5 font-bold text-stone-900 dark:text-white">{t.icon} {t.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{t.min}pt〜</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H>よくある質問</H>
      <div className="mt-4 space-y-2">
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-2xl bg-white px-5 py-4 ring-1 ring-cream-200 dark:bg-stone-900 dark:ring-white/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-stone-900 dark:text-white">
              {f.q}
              <span className="text-stone-400 transition group-open:rotate-45" aria-hidden>＋</span>
            </summary>
            <p className="mt-2 text-sm">{f.a}</p>
          </details>
        ))}
      </div>

      <p className="mt-12 text-sm">
        くわしいルールは<Link to="/terms" className="underline">利用規約</Link>、情報の取り扱いは<Link to="/privacy" className="underline">プライバシーポリシー</Link>をご覧ください。
      </p>
    </article>
  );
}
