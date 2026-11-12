import { ConfirmButton } from "~/components/confirm-button";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/reviews";
import { reasonLabel } from "~/lib/reports";
import { audit, requireAdmin } from "~/lib/admin.server";
import { recalcProductRating, recalcReviewer } from "~/lib/db.server";
import { Badge, Panel, PageTitle, btn } from "~/components/admin-ui";
import { Stars } from "~/components/stars";
import { relativeDate } from "~/lib/format";

type Row = {
  id: number;
  product_id: number;
  product_name: string;
  nickname: string;
  rating: number;
  title: string | null;
  body: string;
  status: string;
  good_count: number;
  bad_count: number;
  created_at: string;
  reports: number;
  reasons: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const admin = await requireAdmin(request, context.cloudflare.env);
  const tab = new URL(request.url).searchParams.get("tab") ?? "attention";
  const where =
    tab === "attention"
      ? "WHERE r.status = 'flagged' OR EXISTS (SELECT 1 FROM user_reports x WHERE x.review_id = r.id AND x.status = 'open')"
      : tab === "hidden"
        ? "WHERE r.status = 'hidden'"
        : "";
  const { results } = await context.cloudflare.env.DB.prepare(
    `SELECT r.id, r.product_id, p.name AS product_name, r.nickname, r.rating, r.title, r.body, r.status, r.good_count, r.bad_count, r.created_at,
            (SELECT COUNT(*) FROM user_reports x WHERE x.review_id = r.id AND x.status = 'open') AS reports,
            (SELECT GROUP_CONCAT(reason, ' / ') FROM user_reports x WHERE x.review_id = r.id AND x.status = 'open') AS reasons
     FROM reviews r JOIN products p ON p.id = r.product_id ${where}
     ORDER BY r.created_at DESC LIMIT 100`,
  ).all<Row>();
  return { reviews: results, tab };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { DB } = context.cloudflare.env;
  const admin = await requireAdmin(request, context.cloudflare.env);
  const form = await request.formData();
  const id = Number(form.get("id"));
  const intent = String(form.get("intent"));
  const row = await DB.prepare("SELECT product_id, reviewer_id FROM reviews WHERE id = ?").bind(id).first<{ product_id: number; reviewer_id: string | null }>();
  if (!row) return { ok: false };
  if (intent === "publish" || intent === "hide") {
    await DB.prepare("UPDATE reviews SET status = ? WHERE id = ?").bind(intent === "publish" ? "published" : "hidden", id).run();
  } else if (intent === "delete") {
    await DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  }
  await DB.prepare("UPDATE user_reports SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE review_id = ? AND status = 'open'")
    .bind(intent === "publish" ? "dismissed" : "actioned", admin.email, id)
    .run();
  if (["publish", "hide", "delete"].includes(intent)) await audit(context.cloudflare.env, request, admin, `review.${intent}`, `review:${id}`);
  await recalcProductRating(DB, row.product_id);
  if (row.reviewer_id) await recalcReviewer(DB, row.reviewer_id);
  return { ok: true };
}

export default function AdminReviews({ loaderData }: Route.ComponentProps) {
  const { reviews, tab } = loaderData;
  const nav = useNavigation();
  const [params] = useSearchParams();
  const tabs = [
    ["attention", "要確認"],
    ["all", "すべて"],
    ["hidden", "非公開"],
  ] as const;
  return (
    <>
      <PageTitle title="口コミ管理" />
      <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 ring-1 ring-stone-200 w-fit dark:bg-stone-900 dark:ring-white/10">
        {tabs.map(([k, v]) => (
          <Link key={k} to={`?tab=${k}`} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-stone-900 font-semibold text-white dark:bg-white dark:text-stone-900" : "text-stone-500"}`}>
            {v}
          </Link>
        ))}
      </div>
      {reviews.length === 0 && <Panel className="py-14 text-center text-stone-500">対象の口コミはありません。</Panel>}
      <div className="space-y-3">
        {reviews.map((r) => (
          <Panel key={r.id} className="!p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={r.status === "published" ? "green" : r.status === "flagged" ? "amber" : "stone"}>
                {{ published: "公開", flagged: "要確認（NGワード・Bad多数）", hidden: "非公開" }[r.status] ?? r.status}
              </Badge>
              {r.reports > 0 && <Badge tone="red">通報 {r.reports}件：{r.reasons?.split(" / ").map(reasonLabel).join(" / ")}</Badge>}
              <Link to={`/products/${r.product_id}`} target="_blank" className="font-semibold hover:underline">{r.product_name}</Link>
              <Stars value={r.rating} />
              <span className="text-xs text-stone-500">👍 {r.good_count} ・ 👎 {r.bad_count}</span>
              <span className="ml-auto text-xs text-stone-400">{r.nickname} ・ {relativeDate(r.created_at)}</span>
            </div>
            {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
            <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{r.body}</p>
            <Form method="post" className="mt-3 flex gap-2">
              <input type="hidden" name="id" value={r.id} />
              {r.status !== "published" && <button name="intent" value="publish" className={btn.success} disabled={nav.state !== "idle"}>公開する</button>}
              {r.status === "published" && r.reports > 0 && <button name="intent" value="publish" className={btn.ghost} disabled={nav.state !== "idle"}>問題なし</button>}
              {r.status !== "hidden" && <button name="intent" value="hide" className={btn.ghost} disabled={nav.state !== "idle"}>非公開にする</button>}
              <ConfirmButton name="intent" value="delete" className={btn.danger} disabled={nav.state !== "idle"} message="この口コミを完全に削除します（元に戻せません）" confirmText="削除する">
                削除
              </ConfirmButton>
            </Form>
          </Panel>
        ))}
      </div>
    </>
  );
}
