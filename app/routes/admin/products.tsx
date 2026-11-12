import { Form, Link, useSearchParams } from "react-router";
import type { Route } from "./+types/products";
import { audit, requireAdmin } from "~/lib/admin.server";
import { listProducts } from "~/lib/db.server";
import { Badge, Panel, PageTitle, btn, input } from "~/components/admin-ui";
import { yen } from "~/lib/format";

export async function loader({ request, context }: Route.LoaderArgs) {
  const admin = await requireAdmin(request, context.cloudflare.env);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return { products: await listProducts(context.cloudflare.env.DB, { q, includeHidden: true, limit: 200 }) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = await requireAdmin(request, context.cloudflare.env);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const status = form.get("status") === "hidden" ? "hidden" : "published";
  await context.cloudflare.env.DB.prepare("UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
  await audit(context.cloudflare.env, request, admin, "product.status", `product:${id}`, status);
  return { ok: true };
}

export default function AdminProducts({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <>
      <PageTitle title="商品">
        <Link to="/admin/products/new" className={btn.primary}>＋ 新規登録</Link>
      </PageTitle>
      <Form className="mb-4 max-w-sm">
        <input name="q" defaultValue={params.get("q") ?? ""} placeholder="商品名・メーカーで検索" className={input} />
      </Form>
      <Panel className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
            <tr>
              <th className="p-3">商品名</th>
              <th className="p-3">メーカー</th>
              <th className="p-3">カテゴリ</th>
              <th className="p-3 text-right">価格</th>
              <th className="p-3 text-right">評価</th>
              <th className="p-3">発売日</th>
              <th className="p-3">状態</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-white/5">
            {loaderData.products.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-white/5">
                <td className="p-3 font-medium">
                  <Link to={`/admin/products/${p.id}`} className="hover:underline">{p.name}</Link>
                </td>
                <td className="p-3 text-stone-500">{p.maker}</td>
                <td className="p-3">{p.category_emoji} {p.category}</td>
                <td className="p-3 text-right tabular-nums">{yen(p.price)}</td>
                <td className="p-3 text-right tabular-nums">{p.review_count ? `${p.rating_avg.toFixed(1)} (${p.review_count})` : "—"}</td>
                <td className="p-3 tabular-nums text-stone-500">{p.released_on}</td>
                <td className="p-3">
                  <Badge tone={p.status === "published" ? "green" : "stone"}>{p.status === "published" ? "公開" : "非公開"}</Badge>
                </td>
                <td className="p-3 text-right">
                  <Form method="post">
                    <input type="hidden" name="id" value={p.id} />
                    <button name="status" value={p.status === "published" ? "hidden" : "published"} className="text-xs text-stone-500 hover:text-stone-900 dark:hover:text-white">
                      {p.status === "published" ? "非公開にする" : "公開する"}
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
