import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/product-edit";
import { audit, requireAdmin } from "~/lib/admin.server";
import { getProduct, getProductChannels, listCategories, listChannels, syncProductFts, upsertMaker } from "~/lib/db.server";
import { Panel, PageTitle, btn, input } from "~/components/admin-ui";
import { ProductVisual } from "~/components/product-visual";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const { DB } = context.cloudflare.env;
  const admin = await requireAdmin(request, context.cloudflare.env);
  const isNew = params.id === "new";
  const product = isNew ? null : await getProduct(DB, Number(params.id), true);
  if (!isNew && !product) throw new Response("Not found", { status: 404 });
  const [categories, channels, selected, cat] = await Promise.all([
    listCategories(DB),
    listChannels(DB),
    product ? getProductChannels(DB, product.id) : Promise.resolve([]),
    product ? DB.prepare("SELECT category_id FROM products WHERE id = ?").bind(product.id).first<{ category_id: number | null }>() : null,
  ]);
  const saved = new URL(request.url).searchParams.has("saved");
  return { product, categories, channels, selected: selected.map((c) => c.id), categoryId: cat?.category_id ?? null, saved };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { DB } = context.cloudflare.env;
  const admin = await requireAdmin(request, context.cloudflare.env);
  const form = await request.formData();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const n = (k: string) => (s(k) === "" ? null : Number(s(k)));
  const makerId = await upsertMaker(DB, s("maker"));
  const imageUrl = /^https?:\/\//.test(s("image_url")) ? s("image_url") : null;
  const values = [s("name"), makerId, n("category_id"), s("jan") || null, n("price"), n("kcal"), s("description") || null, s("accent") || "#f97316", s("released_on") || null, s("status") === "hidden" ? "hidden" : "published", imageUrl, s("source_url") || null];

  let id: number;
  if (params.id === "new") {
    const row = await DB.prepare(
      "INSERT INTO products(name, maker_id, category_id, jan, price, kcal, description, accent, released_on, status, image_url, source_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
    )
      .bind(...values)
      .first<{ id: number }>();
    id = row!.id;
  } else {
    id = Number(params.id);
    await DB.prepare(
      "UPDATE products SET name=?, maker_id=?, category_id=?, jan=?, price=?, kcal=?, description=?, accent=?, released_on=?, status=?, image_url=?, source_url=?, updated_at=datetime('now') WHERE id=?",
    )
      .bind(...values, id)
      .run();
  }

  await DB.prepare("DELETE FROM product_channels WHERE product_id = ?").bind(id).run();
  for (const ch of form.getAll("channels")) {
    await DB.prepare("INSERT INTO product_channels VALUES (?, ?)").bind(id, Number(ch)).run();
  }
  await syncProductFts(DB, id);
  await audit(context.cloudflare.env, request, admin, params.id === "new" ? "product.create" : "product.update", `product:${id}`, s("name"));
  return redirect(`/admin/products/${id}?saved=1`);
}

export default function ProductEdit({ loaderData }: Route.ComponentProps) {
  const { product: p, categories, channels, selected, categoryId, saved } = loaderData;
  const nav = useNavigation();
  return (
    <Form method="post">
      <PageTitle title={p ? "商品を編集" : "商品を登録"}>
        {p && <Link to={`/products/${p.id}`} target="_blank" className={btn.ghost}>↗ 公開ページ</Link>}
        <button className={btn.primary} disabled={nav.state !== "idle"}>{nav.state !== "idle" ? "保存中…" : "保存"}</button>
      </PageTitle>
      {saved && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">保存しました。</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Panel className="grid gap-4 sm:grid-cols-2">
          <L label="商品名" className="sm:col-span-2"><input name="name" required defaultValue={p?.name} className={input} /></L>
          <L label="メーカー"><input name="maker" defaultValue={p?.maker ?? ""} className={input} /></L>
          <L label="カテゴリ">
            <select name="category_id" defaultValue={categoryId ?? ""} className={input}>
              <option value="">未分類</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </L>
          <L label="価格（税込・円）"><input name="price" type="number" defaultValue={p?.price ?? ""} className={input} /></L>
          <L label="カロリー（kcal）"><input name="kcal" type="number" defaultValue={p?.kcal ?? ""} className={input} /></L>
          <L label="発売日"><input name="released_on" type="date" defaultValue={p?.released_on ?? ""} className={input} /></L>
          <L label="JANコード"><input name="jan" defaultValue={p?.jan ?? ""} className={input} /></L>
          <L label="説明" className="sm:col-span-2"><textarea name="description" rows={4} defaultValue={p?.description ?? ""} className={input} /></L>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs text-stone-500">販売チャネル</legend>
            <div className="flex flex-wrap gap-3">
              {channels.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="channels" value={c.id} defaultChecked={selected.includes(c.id)} className="accent-stone-900" /> {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        </Panel>
        <div className="space-y-4">
          <Panel>
            <ProductVisual imageUrl={p?.image_url} imageKey={p?.image_key ?? null} accent={p?.accent ?? "#f97316"} emoji={p?.category_emoji ?? null} name={p?.name ?? ""} className="aspect-square w-full rounded-xl" />
            <L label="画像 URL（収集元の画像を埋め込み表示）" className="mt-3">
              <input name="image_url" type="url" defaultValue={p?.image_url ?? ""} placeholder="https://..." className={input} />
            </L>
            <L label="出典ページ URL" className="mt-3">
              <input name="source_url" type="url" defaultValue={p?.source_url ?? ""} placeholder="https://..." className={input} />
            </L>
            <p className="mt-2 text-xs text-stone-400">画像は自サイトに保存せず、この URL を直接表示します。</p>
            <L label="アクセントカラー（画像なし時）" className="mt-3">
              <input name="accent" type="color" defaultValue={p?.accent ?? "#f97316"} className="h-9 w-full rounded" />
            </L>
          </Panel>
          <Panel>
            <L label="公開状態">
              <select name="status" defaultValue={p?.status ?? "published"} className={input}>
                <option value="published">公開</option>
                <option value="hidden">非公開</option>
              </select>
            </L>
          </Panel>
        </div>
      </div>
    </Form>
  );
}

function L({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}
