import { Link, data } from "react-router";
import type { Route } from "./+types/weekly";
import { weekProducts, type WeeklyProduct } from "~/lib/db.server";
import { getUser } from "~/lib/auth.server";
import { battleVoterKey, ensureBattles, getBattles } from "~/lib/battles.server";
import { BattleBoard } from "~/components/battle-board";
import { CHAIN_ORDER, addDays, mondayOf, todayJst, weekLabel } from "~/lib/weeks";
import { ProductCard } from "~/components/product-card";
import { AdSlot } from "~/components/ad-slot";
import { ShareButtons } from "~/components/share-buttons";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.week)) throw data(null, { status: 404 });
  const monday = mondayOf(params.week);
  if (monday !== params.week) throw new Response(null, { status: 301, headers: { Location: `/weekly/${monday}` } });
  const sunday = addDays(monday, 6);
  const env = context.cloudflare.env;
  const products = await weekProducts(env.DB, monday);
  const current = mondayOf(todayJst());
  if (monday === current) await ensureBattles(env.DB, monday, sunday);
  const user = await getUser(request, env);
  const voter = battleVoterKey(request, user?.id ?? null);
  const voterKey = voter.setCookie ? null : voter.key; // Cookie が未発行なら未投票
  const [battles, lastBattles] = await Promise.all([getBattles(env.DB, monday, voterKey), getBattles(env.DB, addDays(monday, -7), voterKey)]);
  const origin = new URL(request.url).origin;
  return {
    monday,
    sunday,
    products,
    prev: addDays(monday, -7),
    next: monday < current ? addDays(monday, 7) : null,
    isCurrent: monday === current,
    url: `${origin}/weekly/${monday}`,
    origin,
    battles,
    lastBattles,
  };
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: "週間まとめ｜ひとくち" }];
  const title = `${weekLabel(data.monday, data.sunday)}のコンビニ新商品まとめ（${data.products.length}品）｜ひとくち`;
  const desc = `セブン-イレブン・ファミマ・ローソンなどコンビニ5社の${weekLabel(data.monday, data.sunday)}発売の新商品${data.products.length}品を口コミ評価つきでまとめました。`;
  const image = data.products.find((p) => p.image_url)?.image_url;
  return [
    { title },
    { name: "description", content: desc },
    { tagName: "link", rel: "canonical", href: data.url },
    { property: "og:type", content: "article" },
    { property: "og:title", content: title },
    { property: "og:description", content: desc },
    { property: "og:url", content: data.url },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: title,
        numberOfItems: data.products.length,
        itemListElement: data.products.slice(0, 50).map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${data.origin}/products/${p.id}`,
          name: p.name,
        })),
      },
    },
  ];
};

export default function Weekly({ loaderData }: Route.ComponentProps) {
  const { monday, sunday, products, prev, next, isCurrent, url, battles, lastBattles } = loaderData;
  const byChain = CHAIN_ORDER.map((c) => ({ ...c, items: products.filter((p) => p.channels?.split(",").includes(c.slug)) })).filter((c) => c.items.length);
  const others = products.filter((p) => !p.channels);
  const picks = pickHighlights(products);
  const today = todayJst();
  // ファーストレビューのチャンス：口コミ 0 件で、発売から 3 日以内
  const firstChance = products
    .filter((p) => p.review_count === 0 && p.released_on && p.released_on <= today && today <= addDays(p.released_on, 3))
    .slice(0, 8);
  const label = weekLabel(monday, sunday);

  return (
    <div className="pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pb-10 pt-12">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="blob absolute -left-16 top-0 h-72 w-72 rounded-full bg-brand-400/35 blur-3xl" />
          <div className="blob absolute right-0 top-6 h-80 w-80 rounded-full bg-fuchsia-400/25 blur-3xl [animation-delay:-6s]" />
        </div>
        <div className="mx-auto max-w-6xl">
          <nav className="mb-6 flex items-center justify-between text-sm">
            <Link to={`/weekly/${prev}`} className="rounded-full bg-white/70 px-3 py-1.5 font-medium ring-1 ring-stone-200 backdrop-blur hover:bg-white dark:bg-white/10 dark:ring-white/10">← 前の週</Link>
            <Link to="/weekly" className="text-stone-500 hover:text-stone-900 dark:hover:text-white">週間まとめ一覧</Link>
            {next ? (
              <Link to={`/weekly/${next}`} className="rounded-full bg-white/70 px-3 py-1.5 font-medium ring-1 ring-stone-200 backdrop-blur hover:bg-white dark:bg-white/10 dark:ring-white/10">次の週 →</Link>
            ) : (
              <span className="w-20" />
            )}
          </nav>
          <p className="rise text-xs font-bold tracking-[0.2em] text-brand-500">{isCurrent ? "THIS WEEK" : "WEEKLY ROUNDUP"}</p>
          <h1 className="rise mt-1 font-display text-3xl font-black leading-tight sm:text-5xl [animation-delay:60ms]">
            {label}の
            <br className="sm:hidden" />
            コンビニ新商品まとめ
          </h1>
          <p className="rise mt-3 text-stone-600 dark:text-stone-400 [animation-delay:120ms]">
            今週発売の <strong className="text-stone-900 dark:text-white">{products.length}</strong> 商品を、口コミ評価つきでチェック。
          </p>
          <div className="rise mt-6 flex flex-wrap gap-2 [animation-delay:180ms]">
            {byChain.map((c) => (
              <a key={c.slug} href={`#${c.slug}`} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm ring-1 ring-stone-200 transition hover:-translate-y-0.5 dark:bg-stone-900 dark:ring-white/10">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                {c.name}
                <span className="text-stone-400">{c.items.length}</span>
              </a>
            ))}
          </div>
          <div className="rise mt-6 [animation-delay:240ms]">
            <ShareButtons url={url} text={`${label}のコンビニ新商品まとめ #ひとくち`} />
          </div>
        </div>
      </section>

      {products.length === 0 ? (
        <div className="mx-auto max-w-6xl px-4 text-center text-stone-500">
          <p className="text-5xl">🗓️</p>
          <p className="mt-3">この週に発売された商品はまだ登録されていません。</p>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-16 px-4">
          {picks.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-2xl font-black">今週の注目</h2>
              <p className="mb-5 text-sm text-stone-500">{picks[0].review_count ? "口コミ評価の高い商品" : "発売されたばかりの商品"}</p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {picks.map((p, i) => <ProductCard key={p.id} p={p} rank={picks[0].review_count ? i + 1 : undefined} index={i} />)}
              </div>
            </section>
          )}

          {battles.length > 0 && (
            <section id="battles" className="scroll-mt-24">
              <h2 className="mb-1 font-display text-2xl font-black">⚔️ 新商品バトル</h2>
              <p className="mb-5 text-sm text-stone-500">
                {isCurrent ? `今週は ${battles.length} ジャンルで対戦中！ ジャンルごとに、どっちが気になる？ 結果は来週のまとめで発表します。` : "この週のジャンル別バトル結果です。"}
              </p>
              <BattleBoard battles={battles} closed={!isCurrent} />
            </section>
          )}
          {isCurrent && lastBattles.length > 0 && (
            <section>
              <h2 className="mb-1 font-display text-xl font-black">🏆 先週のバトル結果</h2>
              <p className="mb-5 text-sm text-stone-500">みなさんの投票ありがとうございました！</p>
              <BattleBoard battles={lastBattles} closed />
            </section>
          )}

          {firstChance.length > 0 && (
            <section className="rounded-[2rem] bg-gradient-to-br from-amber-50 via-yellow-50 to-rose-50 p-6 ring-1 ring-amber-200/70 sm:p-8 dark:from-amber-500/[0.07] dark:via-transparent dark:to-rose-500/[0.07] dark:ring-amber-400/20">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 text-xs font-black text-amber-950">🥇 FIRST REVIEW CHANCE</p>
              <h2 className="mt-2 font-display text-2xl font-black">まだ誰も口コミしていません！</h2>
              <p className="mb-5 mt-1 text-sm text-stone-600 dark:text-stone-400">発売から3日以内の最初の口コミは「ファーストレビュー」としてボーナス +5pt。一番乗りしませんか？</p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {firstChance.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
              </div>
            </section>
          )}

          <AdSlot format="horizontal" />

          {byChain.map((c, ci) => (
            <section key={c.slug} id={c.slug} className="scroll-mt-24">
              <div className="mb-5 flex items-center gap-3">
                <span className="h-8 w-1.5 rounded-full" style={{ background: c.color }} />
                <h2 className="font-display text-2xl font-black">{c.name}</h2>
                <span className="text-sm text-stone-500">{c.items.length}商品</span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {c.items.map((p, i) => <ProductCard key={p.id} p={p} index={i % 12} />)}
              </div>
              {ci % 2 === 1 && <AdSlot className="mt-12" />}
            </section>
          ))}

          {others.length > 0 && (
            <section>
              <h2 className="mb-5 font-display text-2xl font-black">その他</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {others.map((p, i) => <ProductCard key={p.id} p={p} index={i % 12} />)}
              </div>
            </section>
          )}

          <div className="rounded-[2rem] bg-white p-8 text-center ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
            <p className="font-display text-xl font-black">食べたら口コミを教えてください 🍙</p>
            <p className="mt-2 text-sm text-stone-500">あなたのひとことが、次に買う人の参考になります。</p>
            <div className="mt-5 flex justify-center">
              <ShareButtons url={url} text={`${label}のコンビニ新商品まとめ #ひとくち`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 口コミがある商品は評価順、無ければ画像付きの商品を優先して 4 件 */
function pickHighlights(products: WeeklyProduct[]) {
  const reviewed = products.filter((p) => p.review_count > 0);
  if (reviewed.length >= 4) return reviewed.slice(0, 4);
  return [...reviewed, ...products.filter((p) => p.review_count === 0 && p.image_url)].slice(0, 4);
}
