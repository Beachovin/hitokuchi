import { Link, data } from "react-router";
import type { Route } from "./+types/season";
import { getCustomFeature } from "~/lib/custom-features.server";
import { getUser } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin.server";
import { themeGradient } from "~/lib/features";
import { ProductCard } from "~/components/product-card";
import { AdSlot } from "~/components/ad-slot";
import { ShareButtons } from "~/components/share-buttons";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  // 管理画面で作った特集（下書きは管理者のプレビューのみ）
  const custom = await getCustomFeature(env.DB, { slug: params.slug });
  if (custom) {
    let visible = custom.feature.status === "published";
    let preview = false;
    if (!visible && new URL(request.url).searchParams.has("preview")) {
      const user = await getUser(request, env);
      visible = preview = !!user && (await isAdmin(env, user));
    }
    if (visible) {
      const f = custom.feature;
      return {
        season: { slug: f.slug, title: f.title, lead: f.lead, emoji: f.emoji, gradient: themeGradient(f.theme) },
        products: custom.items,
        url: new URL(request.url).origin + `/features/${f.slug}`,
        preview,
      };
    }
  }
  throw data(null, { status: 404 });
}

export const meta: Route.MetaFunction = ({ data }) =>
  data ? [{ title: `${data.season.title}（${data.products.length}品）｜ひとくち` }, { name: "description", content: data.season.lead }] : [{ title: "特集｜ひとくち" }];

export default function SeasonFeature({ loaderData }: Route.ComponentProps) {
  const { season, products, url, preview } = loaderData;
  return (
    <div>
      <section className={`bg-gradient-to-br ${season.gradient} px-4 pb-12 pt-10 text-white`}>
        <div className="mx-auto max-w-6xl">
          <Link to="/features" className="text-sm opacity-80 hover:opacity-100">← 特集一覧</Link>
          {preview && <p className="mt-3 w-fit rounded-full bg-white/90 px-3 py-1 text-xs font-black text-stone-900">下書きのプレビュー（管理者のみ表示）</p>}
          <p className="mt-6 text-5xl">{season.emoji}</p>
          <h1 className="mt-3 font-display text-3xl font-black sm:text-5xl">{season.title}</h1>
          <p className="mt-2 opacity-90">{season.lead}</p>
          <p className="mt-1 text-sm opacity-75">{products.length}品の新商品</p>
          <div className="mt-6 [&_a]:bg-white/15 [&_a]:text-white [&_button]:text-white [&_button]:ring-white/30">
            <ShareButtons url={url} text={`${season.title} #ひとくち`} />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 pt-8">
        {products.length === 0 ? (
          <p className="py-16 text-center text-stone-500">現在、この特集の対象商品はありません。</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => <ProductCard key={p.id} p={p} index={i % 12} />)}
          </div>
        )}
        <AdSlot className="mt-12" format="horizontal" />
      </div>
    </div>
  );
}
