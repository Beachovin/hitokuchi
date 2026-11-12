import { Link } from "react-router";
import type { Route } from "./+types/index";
import { featureOverview } from "~/lib/features.server";
import { featureThumbs, listCustomFeatures } from "~/lib/custom-features.server";
import { inSeason, SEASONS, themeGradient } from "~/lib/features";
import { todayJst } from "~/lib/weeks";

export const meta: Route.MetaFunction = () => [
  { title: "特集｜地域限定・季節のコンビニ新商品｜ひとくち" },
  { name: "description", content: "地域限定のコンビニ新商品や、季節のフェア商品を特集でまとめています。" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const custom = await listCustomFeatures(db, true);
  const editorial = await Promise.all(custom.filter((f) => (f.item_count ?? 0) > 0).map(async (f) => ({ ...f, thumbs: await featureThumbs(db, f.id) })));
  return { ...(await featureOverview(db)), month: Number(todayJst().slice(5, 7)), editorial };
}

export default function Features({ loaderData }: Route.ComponentProps) {
  const { regions, seasons, month, editorial } = loaderData;
  const seasonInfo = SEASONS.map((s) => ({ ...s, ...seasons.find((x) => x.slug === s.slug)!, now: inSeason(s, month) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => Number(b.now) - Number(a.now) || b.count - a.count);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 md:pt-10">
      <p className="text-xs font-bold tracking-[0.2em] text-brand-500">FEATURES</p>
      <h1 className="font-display text-3xl font-black sm:text-4xl">特集</h1>

      {editorial.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 font-display text-2xl font-black">編集部のおすすめ特集</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {editorial.map((f) => (
              <Link key={f.id} to={`/features/${f.slug}`} className={`card-lift relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${themeGradient(f.theme)} p-6 text-white`}>
                <span className="absolute right-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-stone-900">PICK UP</span>
                <p className="text-4xl">{f.emoji}</p>
                <p className="mt-3 font-display text-xl font-black">{f.title}</p>
                <p className="mt-1 text-sm opacity-85">{f.lead}</p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex -space-x-3">
                    {f.thumbs.map((t) => <img key={t} src={t} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-11 w-11 rounded-xl bg-white object-contain p-0.5 ring-2 ring-white/60" />)}
                  </div>
                  <span className="ml-auto text-sm font-bold">{f.item_count}品 →</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-4 mt-10 font-display text-2xl font-black">季節・テーマ特集</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {seasonInfo.map((s) => (
          <Link key={s.slug} to={`/features/${s.slug}`} className={`card-lift relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${s.gradient} p-6 text-white`}>
            {s.now && s.months.length > 0 && <span className="absolute right-4 top-4 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-stone-900">いまが旬</span>}
            <p className="text-4xl">{s.emoji}</p>
            <p className="mt-3 font-display text-xl font-black">{s.title}</p>
            <p className="mt-1 text-sm opacity-85">{s.lead}</p>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex -space-x-3">
                {s.thumbs.map((t) => <img key={t} src={t} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-11 w-11 rounded-xl bg-white object-contain p-0.5 ring-2 ring-white/60" />)}
              </div>
              <span className="ml-auto text-sm font-bold">{s.count}品 →</span>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="mb-1 mt-14 font-display text-2xl font-black">地域限定の新商品</h2>
      <p className="mb-4 text-sm text-stone-500">その地域でしか買えない、ご当地の新商品です。</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {regions.map((r) => (
          <Link
            key={r.slug}
            to={`/features/region/${r.slug}`}
            className={`card-lift rounded-2xl bg-white p-4 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10 ${r.count === 0 ? "pointer-events-none opacity-40" : ""}`}
          >
            <p className="text-2xl">{r.emoji}</p>
            <p className="mt-1 font-bold">{r.name}限定</p>
            <p className="text-xs text-stone-500">{r.count}品</p>
            <div className="mt-2 flex -space-x-2">
              {r.thumbs.map((t) => <img key={t} src={t} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-8 w-8 rounded-lg bg-white object-contain ring-2 ring-white dark:ring-stone-900" />)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
