import { Form, Link } from "react-router";
import type { Route } from "./+types/post";
import { requireUser } from "~/lib/auth.server";
import { listProducts, type ProductRow } from "~/lib/db.server";
import { addDays, todayJst } from "~/lib/weeks";
import { releaseLabel } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "口コミを書く｜ひとくち" }, { name: "robots", content: "noindex" }];

const COLS = `p.id, p.name, m.name AS maker, c.emoji AS category_emoji, p.image_url, p.released_on, p.accent`;

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const today = todayJst();
  const notReviewed = "AND p.id NOT IN (SELECT product_id FROM reviews WHERE reviewer_id = ?1)";
  const run = (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(user.id, ...binds).all<Pick<ProductRow, "id" | "name" | "maker" | "category_emoji" | "image_url" | "released_on" | "accent">>();
  const base = `FROM products p LEFT JOIN makers m ON m.id = p.maker_id LEFT JOIN categories c ON c.id = p.category_id`;
  const [eaten, favs, fresh, results] = await Promise.all([
    run(`SELECT ${COLS} ${base} JOIN eaten e ON e.product_id = p.id AND e.user_id = ?1 WHERE p.status = 'published' ${notReviewed} ORDER BY e.created_at DESC LIMIT 20`),
    run(`SELECT ${COLS} ${base} JOIN bookmarks b ON b.product_id = p.id AND b.user_id = ?1 WHERE p.status = 'published' AND p.released_on <= ?2 ${notReviewed} ORDER BY p.released_on DESC LIMIT 20`, today),
    run(`SELECT ${COLS} ${base} WHERE p.status = 'published' AND p.released_on BETWEEN ?2 AND ?3 ${notReviewed} ORDER BY p.released_on DESC, p.review_count ASC LIMIT 12`, addDays(today, -7), today),
    q ? listProducts(env.DB, { q, limit: 20 }) : Promise.resolve([]),
  ]);
  return { q, eaten: eaten.results, favs: favs.results, fresh: fresh.results, results };
}

type Item = { id: number; name: string; maker: string | null; category_emoji: string | null; image_url: string | null; released_on: string | null; accent: string };

export default function Post({ loaderData }: Route.ComponentProps) {
  const { q, eaten, favs, fresh, results } = loaderData;
  return (
    <div className="mx-auto max-w-2xl px-4 pt-4">
      <h1 className="font-display text-2xl font-black">口コミを書く</h1>
      <p className="mt-1 text-sm text-stone-500">食べた商品を選んで、星をタップするだけ。ひとことでもOKです。</p>

      <Form className="relative mt-4">
        <input name="q" defaultValue={q} placeholder="商品名で探す" aria-label="商品を検索" className="w-full rounded-2xl bg-white py-3.5 pl-11 pr-4 shadow-sm outline-none ring-1 ring-cream-200 focus:ring-2 focus:ring-brand-400 dark:bg-stone-900 dark:ring-white/10" />
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </Form>

      {q ? (
        <Group title={`「${q}」の検索結果`} items={results} empty="見つかりませんでした" />
      ) : (
        <>
          <Group title="🍽️ 食べた商品" items={eaten} empty="「食べた」を押した商品がここに出ます" />
          <Group title="❤️ 気になる（発売済み）" items={favs} empty="「気になる」に入れた商品が発売されるとここに出ます" />
          <Group title="🆕 最近の新商品" items={fresh} empty="" />
        </>
      )}
    </div>
  );
}

function Group({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-sm font-black text-stone-600 dark:text-stone-300">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-white/60 p-4 text-center text-xs text-stone-400 ring-1 ring-cream-200 dark:bg-white/5 dark:ring-white/10">{empty}</p>
      ) : (
        <ul className="overflow-hidden rounded-3xl bg-white ring-1 ring-cream-200 dark:bg-stone-900 dark:ring-white/10">
          {items.map((p) => (
            <li key={p.id} className="border-b border-cream-200 last:border-0 dark:border-white/5">
              <Link to={`/products/${p.id}#quick`} className="flex items-center gap-3 p-3 transition active:bg-cream">
                {p.image_url ? (
                  <img src={p.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1 ring-1 ring-cream-200 dark:ring-white/10" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `${p.accent}33` }}>{p.category_emoji ?? "🍙"}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-xs text-stone-500">{p.maker}{p.released_on && ` ・ ${releaseLabel(p.released_on)}`}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-brand-500 px-3 py-1.5 text-xs font-bold text-white">書く</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
