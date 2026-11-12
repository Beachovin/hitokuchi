import { Link } from "react-router";
import type { Route } from "./+types/favorites";
import { requireUser } from "~/lib/auth.server";
import { bookmarkedProducts } from "~/lib/db.server";
import { ProductCard } from "~/components/product-card";

export const meta: Route.MetaFunction = () => [{ title: "気になる｜ひとくち" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const sort = new URL(request.url).searchParams.get("sort") === "release" ? "release" : "added";
  const products = await bookmarkedProducts(env.DB, user.id); // 登録が新しい順
  if (sort === "release") products.sort((a, b) => (b.released_on ?? "").localeCompare(a.released_on ?? ""));
  return { products, sort };
}

export default function Favorites({ loaderData }: Route.ComponentProps) {
  const { products, sort } = loaderData;
  const tabs = [
    ["added", "登録が新しい順"],
    ["release", "発売日が新しい順"],
  ] as const;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 md:pt-10">
      <p className="text-xs font-bold tracking-[0.2em] text-rose-500">FAVORITES</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-black sm:text-4xl">
          気になる <span className="text-xl text-stone-400">{products.length}</span>
        </h1>
        {products.length > 1 && (
          <div className="flex rounded-full bg-stone-100 p-1 text-sm dark:bg-white/10">
            {tabs.map(([k, v]) => (
              <Link
                key={k}
                to={k === "added" ? "/favorites" : `/favorites?sort=${k}`}
                preventScrollReset
                className={`rounded-full px-3 py-1.5 transition ${sort === k ? "bg-white font-semibold shadow-sm dark:bg-stone-800" : "text-stone-500"}`}
              >
                {v}
              </Link>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-stone-500">商品の ♡ を押すと、ここに保存されます。食べたら口コミも書いてみてください。</p>

      {products.length === 0 ? (
        <div className="mt-10 rounded-3xl border-2 border-dashed border-stone-200 p-12 text-center text-stone-500 dark:border-white/10">
          <p className="text-5xl">🤍</p>
          <p className="mt-3">「気になる」に登録した商品はまだありません。</p>
          <Link to="/weekly" className="mt-5 inline-block rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-stone-900">今週の新商品を見る</Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p, i) => <ProductCard key={p.id} p={p} index={i % 12} />)}
        </div>
      )}
    </div>
  );
}
