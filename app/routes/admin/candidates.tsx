import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/candidates";
import { audit, requireAdmin } from "~/lib/admin.server";
import { listCategories, syncProductFts, upsertMaker } from "~/lib/db.server";
import { Badge, Panel, PageTitle, btn, input } from "~/components/admin-ui";
import { relativeDate } from "~/lib/format";

type Candidate = {
  id: number;
  source_url: string;
  name: string;
  maker: string | null;
  category_hint: string | null;
  jan: string | null;
  price: number | null;
  kcal: number | null;
  released_on: string | null;
  description: string | null;
  image_url: string | null;
  confidence: number;
  duplicate_of: number | null;
  duplicate_name: string | null;
  source_name: string | null;
  channel_id: number | null;
  region: string | null;
  normalized_by: string;
  created_at: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { DB } = context.cloudflare.env;
  const admin = await requireAdmin(request, context.cloudflare.env);
  const { results } = await DB.prepare(
    `SELECT c.*, p.name AS duplicate_name, s.name AS source_name, s.channel_id
     FROM product_candidates c
     LEFT JOIN products p ON p.id = c.duplicate_of
     LEFT JOIN scrape_sources s ON s.id = c.source_id
     WHERE c.status = 'pending' ORDER BY c.confidence DESC, c.id DESC LIMIT 100`,
  ).all<Candidate>();
  const total = await DB.prepare("SELECT COUNT(*) AS n FROM product_candidates WHERE status = 'pending'").first<{ n: number }>();
  return { candidates: results, total: total?.n ?? 0, categories: await listCategories(DB) };
}

const ACCENTS = ["#f97316", "#e11d48", "#a16207", "#16a34a", "#0ea5e9", "#9333ea", "#db2777", "#ca8a04"];

async function approve(env: Env, id: number, overrides: FormData | null) {
  const { DB } = env;
  const c = await DB.prepare(
    "SELECT c.*, s.channel_id FROM product_candidates c LEFT JOIN scrape_sources s ON s.id = c.source_id WHERE c.id = ? AND c.status = 'pending'",
  )
    .bind(id)
    .first<Candidate>();
  if (!c) return;
  const get = (k: string) => {
    const v = overrides?.get(`${k}_${id}`);
    return v == null ? undefined : String(v).trim();
  };
  const num = (v: string | undefined, fallback: number | null) => (v === undefined ? fallback : v === "" ? null : Number(v));
  const name = get("name") || c.name;
  const makerId = await upsertMaker(DB, get("maker") ?? c.maker);
  const hinted = c.category_hint
    ? await DB.prepare("SELECT id FROM categories WHERE slug = ? OR name = ?").bind(c.category_hint, c.category_hint).first<{ id: number }>()
    : null;
  const categoryId = num(get("category"), hinted?.id ?? null);
  const price = num(get("price"), c.price);
  const kcal = num(get("kcal"), c.kcal);
  const released = get("released_on") || c.released_on;

  let productId: number;
  if (c.duplicate_of) {
    // 既存商品にマージ（空欄だけ埋める）
    productId = c.duplicate_of;
    await DB.prepare(
      `UPDATE products SET price = COALESCE(price, ?), kcal = COALESCE(kcal, ?), released_on = COALESCE(released_on, ?),
         description = COALESCE(description, ?), jan = COALESCE(jan, ?), source_url = COALESCE(source_url, ?), image_url = COALESCE(image_url, ?), region = COALESCE(region, ?), updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(price, kcal, released, c.description, c.jan, c.source_url, c.image_url, c.region, productId)
      .run();
  } else {
    const row = await DB.prepare(
      `INSERT INTO products(name, maker_id, category_id, jan, price, kcal, description, accent, released_on, source_url, image_url, region)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    )
      .bind(name, makerId, categoryId, c.jan, price, kcal, c.description, ACCENTS[id % ACCENTS.length], released, c.source_url, c.image_url, c.region)
      .first<{ id: number }>();
    productId = row!.id;
    await syncProductFts(DB, productId);
  }
  if (c.channel_id) {
    await DB.prepare("INSERT OR IGNORE INTO product_channels VALUES (?, ?)").bind(productId, c.channel_id).run();
  }
  await DB.prepare("UPDATE product_candidates SET status = 'approved', duplicate_of = ? WHERE id = ?").bind(productId, id).run();
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const [verb, idStr] = intent.split(":");
  if (verb === "approve") {
    await approve(env, Number(idStr), form);
    await audit(env, request, admin, "candidate.approve", `candidate:${idStr}`, form.get(`name_${idStr}`));
  } else if (verb === "reject") {
    await env.DB.prepare("UPDATE product_candidates SET status='rejected' WHERE id = ?").bind(Number(idStr)).run();
    await audit(env, request, admin, "candidate.reject", `candidate:${idStr}`);
  }
  else if (verb === "bulk-approve" || verb === "bulk-reject") {
    const ids = form.getAll("selected").map(Number);
    for (const id of ids) {
      if (verb === "bulk-approve") await approve(env, id, form);
      else await env.DB.prepare("UPDATE product_candidates SET status='rejected' WHERE id = ?").bind(id).run();
    }
    if (ids.length) {
      await audit(env, request, admin, verb === "bulk-approve" ? "candidate.approve" : "candidate.reject", `candidate:${ids.length}件`, ids.join(","));
    }
  }
  return { ok: true };
}

export default function Candidates({ loaderData }: Route.ComponentProps) {
  const { candidates, total, categories } = loaderData;
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const guessCategory = (hint: string | null) => categories.find((c) => hint && (c.slug === hint || hint.includes(c.name) || c.name.includes(hint)))?.id ?? "";
  return (
    <Form method="post">
      <PageTitle title={`承認待ち（${total}件${total > candidates.length ? `・上位${candidates.length}件を表示` : ""}）`}>
        <button name="intent" value="bulk-reject" className={btn.ghost} disabled={busy}>選択を却下</button>
        <button name="intent" value="bulk-approve" className={btn.success} disabled={busy}>✓ 選択を一括承認</button>
      </PageTitle>
      <p className="mb-4 text-sm text-stone-500">
        自動収集で見つかった新商品です。内容を確認・修正して承認すると公開されます。「重複の可能性」がある候補は承認すると既存商品の空欄を補完します。
      </p>
      {candidates.length === 0 && (
        <Panel className="py-14 text-center text-stone-500">
          <p className="text-4xl">🎉</p>
          <p className="mt-2">承認待ちの候補はありません。</p>
        </Panel>
      )}
      <div className="space-y-3">
        {candidates.map((c) => (
          <Panel key={c.id} className="!p-4">
            <div className="flex flex-wrap items-start gap-4">
              <input type="checkbox" name="selected" value={c.id} defaultChecked={c.confidence >= 0.8 && !c.duplicate_of} className="mt-2 h-4 w-4 accent-stone-900" aria-label={`${c.name} を選択`} />
              {c.image_url ? (
                <img src={c.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-xl bg-stone-100 object-cover ring-1 ring-stone-200 dark:ring-white/10" />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-stone-100 text-2xl dark:bg-white/5">🍽️</div>
              )}
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={c.confidence >= 0.8 ? "green" : c.confidence >= 0.6 ? "amber" : "red"}>確信度 {Math.round(c.confidence * 100)}%</Badge>
                  {c.duplicate_of && (
                    <Badge tone="blue">
                      重複の可能性：<Link to={`/products/${c.duplicate_of}`} target="_blank" className="ml-1 underline">{c.duplicate_name}</Link>
                    </Badge>
                  )}
                  <Badge tone={c.normalized_by === "claude" ? "blue" : "stone"}>{c.normalized_by === "claude" ? "✨ Claude 整形" : "ルール整形"}</Badge>
                  <span className="text-xs text-stone-400">
                    {c.source_name ?? "手動"} ・ {relativeDate(c.created_at)} ・{" "}
                    <a href={c.source_url} target="_blank" rel="noreferrer" className="underline hover:text-stone-700">元ページ</a>
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <Field label="商品名" className="lg:col-span-2"><input name={`name_${c.id}`} defaultValue={c.name} className={input} /></Field>
                  <Field label="メーカー"><input name={`maker_${c.id}`} defaultValue={c.maker ?? ""} className={input} /></Field>
                  <Field label={`カテゴリ${c.category_hint ? "（推定）" : "（未判定）"}`}>
                    <select name={`category_${c.id}`} defaultValue={guessCategory(c.category_hint)} className={input}>
                      <option value="">未分類</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="価格(円)"><input name={`price_${c.id}`} type="number" defaultValue={c.price ?? ""} className={input} /></Field>
                  <Field label="kcal"><input name={`kcal_${c.id}`} type="number" defaultValue={c.kcal ?? ""} className={input} /></Field>
                  <Field label="発売日"><input name={`released_on_${c.id}`} type="date" defaultValue={c.released_on ?? ""} className={input} /></Field>
                </div>
                {c.description && <p className="text-sm text-stone-600 dark:text-stone-400">{c.description}</p>}
                {c.region && <p className="text-xs text-stone-400">販売地域：{c.region}</p>}
              </div>
              <div className="flex gap-2 sm:flex-col">
                <button name="intent" value={`approve:${c.id}`} className={btn.success} disabled={busy}>承認</button>
                <button name="intent" value={`reject:${c.id}`} className={btn.danger} disabled={busy}>却下</button>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </Form>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs text-stone-500">{label}</span>
      {children}
    </label>
  );
}
