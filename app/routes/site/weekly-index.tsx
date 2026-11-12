import { Link } from "react-router";
import type { Route } from "./+types/weekly-index";
import { listWeeks } from "~/lib/db.server";
import { addDays, mondayOf, shortWeekLabel, todayJst } from "~/lib/weeks";

export const meta: Route.MetaFunction = () => [
  { title: "週間まとめ｜コンビニ新商品を毎週チェック｜ひとくち" },
  { name: "description", content: "セブン-イレブン・ファミリーマート・ローソン・ミニストップ・デイリーヤマザキの新商品を週ごとにまとめています。" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const weeks = await listWeeks(context.cloudflare.env.DB, 52);
  return { weeks, current: mondayOf(todayJst()) };
}

export default function WeeklyIndex({ loaderData }: Route.ComponentProps) {
  const { weeks, current } = loaderData;
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 md:pt-10">
      <p className="text-xs font-bold tracking-[0.2em] text-brand-500">WEEKLY ROUNDUP</p>
      <h1 className="font-display text-3xl font-black sm:text-4xl">週間まとめ</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-400">コンビニ5社の新商品を、発売週ごとにまとめています。</p>
      <Link
        to={`/weekly/${current}`}
        className="card-lift mt-8 block overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-500 via-rose-500 to-fuchsia-500 p-8 text-white shadow-xl shadow-brand-500/20"
      >
        <p className="text-sm font-semibold opacity-80">今週のまとめ</p>
        <p className="mt-1 font-display text-3xl font-black">{shortWeekLabel(current, addDays(current, 6))}</p>
        <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold">見る →</p>
      </Link>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {weeks.map((w) => (
          <li key={w.week}>
            <Link
              to={`/weekly/${w.week}`}
              className="card-lift flex items-center justify-between rounded-2xl bg-white p-5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10"
            >
              <span className="font-bold">{shortWeekLabel(w.week, addDays(w.week, 6))}</span>
              <span className="text-sm text-stone-500">{w.n}商品 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
