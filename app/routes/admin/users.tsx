import { ConfirmButton } from "~/components/confirm-button";
import { Form, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/users";
import { audit, requireAdmin } from "~/lib/admin.server";
import { suspendable, suspendUser, unsuspendUser } from "~/lib/suspension.server";
import { Badge, Panel, PageTitle, btn, input } from "~/components/admin-ui";
import { relativeDate } from "~/lib/format";

type Row = {
  id: string;
  email: string;
  nickname: string | null;
  role: string;
  is_demo: number;
  created_at: string;
  last_login_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  reviews: number;
  open_reports: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const filter = url.searchParams.get("filter") ?? "";
  const where: string[] = [];
  const binds: string[] = [];
  if (q) {
    where.push("(u.nickname LIKE ? OR u.email LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (filter === "suspended") where.push("u.suspended_at IS NOT NULL");
  if (filter === "reported") where.push("EXISTS (SELECT 1 FROM user_reports ur WHERE ur.target_user_id = u.id AND ur.status = 'open')");
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.email, u.nickname, u.role, u.is_demo, u.created_at, u.last_login_at, u.suspended_at, u.suspended_reason,
            (SELECT COUNT(*) FROM reviews r WHERE r.reviewer_id = u.id) AS reviews,
            (SELECT COUNT(*) FROM user_reports ur WHERE ur.target_user_id = u.id AND ur.status = 'open') AS open_reports
     FROM users u ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY open_reports DESC, (u.suspended_at IS NOT NULL) DESC, u.created_at DESC LIMIT 200`,
  )
    .bind(...binds)
    .all<Row>();
  const owners = env.ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { users: results.map((u) => ({ ...u, protected: u.role === "admin" || owners.includes(u.email.toLowerCase()), self: u.id === admin.id })) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const form = await request.formData();
  const id = String(form.get("id"));
  const intent = String(form.get("intent"));
  const ok = await suspendable(env, id, admin.id);
  if ("error" in ok) return { error: ok.error };
  if (intent === "suspend") {
    const reason = String(form.get("reason") ?? "").trim() || "管理者の判断";
    const r = await suspendUser(env, id, reason, admin.email);
    await audit(env, request, admin, "user.suspend", `user:${ok.user.email}`, { reason, hiddenReviews: r.hiddenReviews });
    return { message: `${ok.user.email} を停止しました` };
  }
  if (intent === "unsuspend") {
    await unsuspendUser(env, id);
    await audit(env, request, admin, "user.unsuspend", `user:${ok.user.email}`);
    return { message: `${ok.user.email} の停止を解除しました（非表示にした口コミを元に戻しました）` };
  }
  return null;
}

export default function AdminUsers({ loaderData, actionData }: Route.ComponentProps) {
  const { users } = loaderData;
  const [params] = useSearchParams();
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <PageTitle title="ユーザー" />
      <Panel className="mb-4 !py-3 text-sm text-stone-600 dark:text-stone-300">
        問題のあるユーザーはアカウントを停止できます。停止するとログインできなくなり、口コミはすべて非表示になります（解除すると元に戻ります）。管理者（<code>ADMIN_EMAILS</code>）は停止できません。
      </Panel>
      {actionData && "message" in actionData && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{actionData.message}</p>}
      {actionData && "error" in actionData && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionData.error}</p>}
      <Form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={params.get("q") ?? ""} placeholder="ニックネーム・メールで検索" className={`${input} max-w-xs`} />
        <select name="filter" defaultValue={params.get("filter") ?? ""} className={`${input} w-auto`}>
          <option value="">すべて</option>
          <option value="reported">未対応の通報あり</option>
          <option value="suspended">停止中</option>
        </select>
        <button className={btn.ghost}>検索</button>
      </Form>
      <Panel className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
            <tr><th className="p-3">ユーザー</th><th className="p-3">状態</th><th className="p-3 text-right">口コミ</th><th className="p-3 text-right">通報</th><th className="p-3">最終ログイン</th><th className="p-3">アカウント停止</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-white/5">
            {users.map((u) => (
              <tr key={u.id} className={u.suspended_at ? "bg-rose-50/50 dark:bg-rose-500/[0.04]" : ""}>
                <td className="p-3">
                  <p className="font-medium">{u.nickname ?? "（未設定）"} {u.self && <span className="text-xs text-stone-400">（あなた）</span>}</p>
                  <p className="text-xs text-stone-400">{u.email} ・ 登録 {relativeDate(u.created_at)}</p>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {u.suspended_at ? <Badge tone="red">停止中</Badge> : <Badge tone="green">利用中</Badge>}
                    {u.protected && <Badge tone="blue">管理者</Badge>}
                    {u.is_demo === 1 && <Badge>デモ</Badge>}
                  </div>
                  {u.suspended_reason && <p className="mt-1 max-w-48 truncate text-[11px] text-rose-600" title={u.suspended_reason}>理由：{u.suspended_reason}</p>}
                </td>
                <td className="p-3 text-right tabular-nums">{u.reviews}</td>
                <td className="p-3 text-right tabular-nums">{u.open_reports > 0 ? <a href="/admin/reports" className="font-bold text-rose-600 underline">{u.open_reports}</a> : 0}</td>
                <td className="p-3 text-xs text-stone-500">{u.last_login_at ? relativeDate(u.last_login_at) : "—"}</td>
                <td className="p-3">
                  {!u.self && !u.protected && (
                    <Form method="post" className="flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      {u.suspended_at ? (
                        <ConfirmButton name="intent" value="unsuspend" className={btn.ghost} disabled={busy} message="停止を解除しますか？" confirmText="解除する">停止を解除</ConfirmButton>
                      ) : (
                        <>
                          <input name="reason" placeholder="理由" aria-label="停止の理由" className={`${input} w-32`} />
                          <ConfirmButton name="intent" value="suspend" className={btn.danger} disabled={busy} message="ログイン不可・口コミ非表示になります" confirmText="停止する">🚫 停止</ConfirmButton>
                        </>
                      )}
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
