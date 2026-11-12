import { Link, data } from "react-router";
import type { Route } from "./+types/region";
import { regionProducts } from "~/lib/features.server";
import { AREAS } from "~/lib/features";
import { ProductCard } from "~/components/product-card";
import { AdSlot } from "~/components/ad-slot";

export async function loader({ params, context }: Route.LoaderArgs) {
  const area = AREAS.find((a) => a.slug === params.slug);
  if (!area) throw data(null, { status: 404 });
  return { area: { slug: area.slug, name: area.name, emoji: area.emoji }, products: await regionProducts(context.cloudflare.env.DB, area.slug) };
}

export const meta: Route.MetaFunction = ({ data }) =>
  data
    ? [{ title: `${data.area.name}限定のコンビニ新商品（${data.products.length}品）｜ひとくち` }, { name: "description", content: `${data.area.name}でしか買えないコンビニの新商品をまとめました。` }]
    : [{ title: "特集｜ひとくち" }];

export default function RegionFeature({ loaderData }: Route.ComponentProps) {
  const { area, products } = loaderData;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 md:pt-10">
      <Link to="/features" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">← 特集一覧</Link>
      <p className="mt-6 text-5xl">{area.emoji}</p>
      <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">{area.name}限定の新商品</h1>
      <p className="mt-1 text-sm text-stone-500">{area.name}エリアだけで販売されている新商品 {products.length}品（販売地域は各社の公開情報にもとづきます）</p>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p, i) => <ProductCard key={p.id} p={p} index={i % 12} />)}
      </div>
      {products.length === 0 && <p className="py-16 text-center text-stone-500">現在、この地域限定の新商品はありません。</p>}
      <AdSlot className="mt-12" format="horizontal" />
    </div>
  );
}
