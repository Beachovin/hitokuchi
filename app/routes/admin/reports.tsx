import { ConfirmButton } from "~/components/confirm-button";
import { Form, Link, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/reports";
import { audit, requireAdmin } from "~/lib/admin.server";
import { recalcProductRating } from "~/lib/db.server";
import { reasonLabel } from "~/lib/reports";
import { suspendable, suspendUser } from "~/lib/suspension.server";
import { Badge, Panel, PageTitle, btn, input } from "~/components/admin-ui";
import { relativeDate } from "~/lib/format";

type Report = {
  id: number;
  target_user_id: string | null;
  target_nickname: string | null;
  target_email: string | null;
  target_suspended: string | null;
  target_reviews: number;
  review_id: number | null;
  review_body: string | null;
  review_title: string | null;
  review_status: string | null;
  product_id: number | null;
  product_name: string | null;
  reporter_nickname: string | null;
  reason: string;
  detail: string | null;
  status: string;
  resolved_by: string | null;
  created_at: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const tab = new URL(request.url).searchParams.get("tab") === "done" ? "done" : "open";
  const { results } = await env.DB.prepare(
    `SELECT ur.id, ur.target_user_id, tu.nickname AS target_nickname, tu.email AS target_email, tu.suspended_at AS target_suspended,
            (SELECT COUNT(*) FROM reviews x WHERE x.reviewer_id = ur.target_user_id) AS target_reviews,
            ur.review_id, r.body AS review_body, r.title AS review_title, r.status AS review_status, r.product_id, p.name AS product_name,
            ru.nickname AS reporter_nickname, ur.reason, ur.detail, ur.status, ur.resolved_by, ur.created_at
     FROM user_reports ur
     LEFT JOIN users tu ON tu.id = ur.target_user_id
     LEFT JOIN users ru ON ru.id = ur.reporter_id
     LEFT JOIN reviews r ON r.id = ur.review_id
     LEFT JOIN products p ON p.id = r.product_id
     WHERE ${tab === "open" ? "ur.status = 'open'" : "ur.status != 'open'"}
     ORDER BY ur.created_at DESC LIMIT 300`,
  ).all<Report>();
  // 通報されたユーザーごとにまとめる
  const groups = new Map<string, { user: { id: string | null; nickname: string | null; email: string | null; suspended: string | null; reviews: number }; reports: Report[] }>();
  for (const r of results) {
    const key = r.target_user_id ?? "unknown";
    if (!groups.has(key)) groups.set(key, { user: { id: r.target_user_id, nickname: r.target_nickname, email: r.target_email, suspended: r.target_suspended, reviews: r.target_reviews }, reports: [] });
    groups.get(key)!.reports.push(r);
  }
  return { tab, groups: [...groups.values()].sort((a, b) => b.reports.length - a.reports.length) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const userId = String(form.get("userId") ?? "");

  if (intent === "suspend") {
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) return { error: "停止の理由を入力してください" };
    const ok = await suspendable(env, userId, admin.id);
    if ("error" in ok) return { error: ok.error };
    const r = await suspendUser(env, userId, reason, admin.email);
    await audit(env, request, admin, "user.suspend", `user:${ok.user.email}`, { reason, hiddenReviews: r.hiddenReviews });
    return { message: `${ok.user.email} のアカウントを停止しました（口コミ ${r.hiddenReviews}件を非表示）` };
  }
  if (intent === "dismiss") {
    await env.DB.prepare("UPDATE user_reports SET status = 'dismissed', resolved_by = ?, resolved_at = datetime('now') WHERE target_user_id = ? AND status = 'open'")
      .bind(admin.email, userId)
      .run();
    await audit(env, request, admin, "report.dismiss", `user:${userId}`);
    return { message: "通報を「問題なし」として処理しました" };
  }
  if (intent === "hide-review") {
    const reviewId = Number(form.get("reviewId"));
    const row = await env.DB.prepare("SELECT product_id FROM reviews WHERE id = ?").bind(reviewId).first<{ product_id: number }>();
    if (row) {
      await env.DB.batch([
        env.DB.prepare("UPDATE reviews SET status = 'hidden' WHERE id = ?").bind(reviewId),
        env.DB.prepare("UPDATE user_reports SET status = 'actioned', resolved_by = ?, resolved_at = datetime('now') WHERE review_id = ? AND status = 'open'").bind(admin.email, reviewId),
      ]);
      await recalcProductRating(env.DB, row.product_id);
      await audit(env, request, admin, "review.hide", `review:${reviewId}`, "通報から");
    }
    return { message: "口コミを非公開にしました" };
  }
  return null;
}

export default function AdminReports({ loaderData, actionData }: Route.ComponentProps) {
  const { groups, tab } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [params] = useSearchParams();
  return (
    <>
      <PageTitle title="通報" />
      <div className="mb-4 flex w-fit gap-1 rounded-xl bg-white p-1 ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-white/10">
        {(
          [
            ["open", "未対応"],
            ["done", "対応済み"],
          ] as const
        ).map(([k, v]) => (
          <Link key={k} to={k === "open" ? "/admin/reports" : "/admin/reports?tab=done"} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-stone-900 font-semibold text-white dark:bg-white dark:text-stone-900" : "text-stone-500"}`}>
            {v}
          </Link>
        ))}
      </div>
      {actionData && "message" in actionData && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{actionData.message}</p>}
      {actionData && "error" in actionData && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionData.error}</p>}
      {groups.length === 0 && <Panel className="py-14 text-center text-stone-500">{params.get("tab") === "done" ? "対応済みの通報はありません。" : "未対応の通報はありません 🎉"}</Panel>}

      <div className="space-y-4">
        {groups.map((g) => (
          <Panel key={g.user.id ?? "unknown"} className="!p-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 p-4 dark:border-white/5">
              <div className="min-w-0">
                <p className="font-bold">
                  {g.user.nickname ?? "（退会済みユーザー）"}
                  {g.user.suspended && <span className="ml-2"><Badge tone="red">停止中</Badge></span>}
                </p>
                <p className="text-xs text-stone-400">{g.user.email} ・ 口コミ {g.user.reviews}件</p>
              </div>
              <Badge tone={g.reports.length >= 3 ? "red" : "amber"}>通報 {g.reports.length}件</Badge>
              <div className="flex flex-wrap gap-1">
                {[...new Set(g.reports.map((r) => r.reason))].map((x) => <Badge key={x}>{reasonLabel(x)}</Badge>)}
              </div>
            </div>

            <ul className="divide-y divide-stone-100 dark:divide-white/5">
              {g.reports.map((r) => (
                <li key={r.id} className="p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <Badge>{reasonLabel(r.reason)}</Badge>
                    <span>通報者：{r.reporter_nickname ?? "（退会済み）"}</span>
                    <span>・{relativeDate(r.created_at)}</span>
                    {r.status !== "open" && <span>・{r.status === "actioned" ? "対応済み" : "問題なし"}（{r.resolved_by}）</span>}
                  </div>
                  {r.detail && <p className="mt-2 rounded-lg bg-stone-50 p-2 text-stone-700 dark:bg-white/5 dark:text-stone-300">「{r.detail}」</p>}
                  {r.review_id && (
                    <div className="mt-2 rounded-lg border border-stone-200 p-3 dark:border-white/10">
                      <p className="text-xs text-stone-400">
                        対象の口コミ：
                        <Link to={`/products/${r.product_id}`} target="_blank" className="underline">{r.product_name}</Link>
                        {r.review_status && r.review_status !== "published" && <span className="ml-2"><Badge tone="stone">{r.review_status === "flagged" ? "要確認（非公開）" : "非公開"}</Badge></span>}
                      </p>
                      {r.review_title && <p className="mt-1 font-semibold">{r.review_title}</p>}
                      <p className="mt-1 text-stone-700 dark:text-stone-300">{r.review_body || "（ひとこと口コミ・本文なし）"}</p>
                      {tab === "open" && r.review_status !== "hidden" && (
                        <Form method="post" className="mt-2">
                          <input type="hidden" name="intent" value="hide-review" />
                          <input type="hidden" name="reviewId" value={r.review_id} />
                          <button className={btn.ghost} disabled={busy}>この口コミを非公開にする</button>
                        </Form>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {tab === "open" && g.user.id && !g.user.suspended && (
              <div className="flex flex-wrap items-end gap-3 border-t border-stone-100 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02]">
                <Form method="post" className="flex flex-1 flex-wrap items-end gap-2">
                  <input type="hidden" name="intent" value="suspend" />
                  <input type="hidden" name="userId" value={g.user.id} />
                  <label className="min-w-56 flex-1">
                    <span className="mb-1 block text-xs text-stone-500">停止の理由（記録用・必須）</span>
                    <input name="reason" required placeholder="例：誹謗中傷の繰り返し" className={input} />
                  </label>
                  <ConfirmButton className={btn.danger} disabled={busy} message="ログイン不可・口コミはすべて非表示になります" confirmText="停止する">
                    🚫 アカウントを停止
                  </ConfirmButton>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="dismiss" />
                  <input type="hidden" name="userId" value={g.user.id} />
                  <button className={btn.ghost} disabled={busy}>問題なし（通報を却下）</button>
                </Form>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </>
  );
}
