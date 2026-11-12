import { useSearchParams, Form } from "react-router";
import type { Route } from "./+types/audit";
import { requireAdmin } from "~/lib/admin.server";
import { Panel, PageTitle, btn, input } from "~/components/admin-ui";

type Log = { id: number; email: string; action: string; target: string | null; detail: string | null; ip: string | null; created_at: string };

const LABELS: Record<string, string> = {
  "candidate.approve": "候補を承認",
  "candidate.reject": "候補を却下",
  "product.update": "商品を更新",
  "product.create": "商品を登録",
  "product.status": "公開状態を変更",
  "review.publish": "口コミを公開",
  "review.hide": "口コミを非公開",
  "review.delete": "口コミを削除",
  "source.run": "収集を実行",
  "source.toggle": "収集元の有効/停止",
  "source.backfill": "商品説明を補完",
  "settings.update": "設定を変更",
  "dashboard.collect": "収集を実行",
  "dashboard.notify": "通知を生成",
  "dashboard.summary": "AI 要約を生成",
  "dashboard.battles": "新商品バトルを作成",
  "user.suspend": "アカウントを停止",
  "user.unsuspend": "アカウント停止を解除",
  "report.dismiss": "通報を却下（問題なし）",
  "admin.login": "管理画面にアクセス",
  "feature.create": "特集を作成",
  "feature.update": "特集を更新",
  "feature.delete": "特集を削除",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const { results } = await env.DB.prepare(
    `SELECT id, email, action, target, detail, ip, datetime(created_at, '+9 hours') AS created_at FROM admin_audit_logs
     ${q ? "WHERE email LIKE ?1 OR action LIKE ?1 OR target LIKE ?1" : ""} ORDER BY id DESC LIMIT 300`,
  )
    .bind(...(q ? [`%${q}%`] : []))
    .all<Log>();
  return { logs: results };
}

export default function AdminAudit({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <>
      <PageTitle title="操作ログ" />
      <p className="mb-4 text-sm text-stone-500">管理画面での変更操作はすべて記録されます（誰が・いつ・何を）。ログは画面からは削除できません。</p>
      <Form className="mb-4 flex gap-2">
        <input name="q" defaultValue={params.get("q") ?? ""} placeholder="メール・操作・対象で検索" className={`${input} max-w-xs`} />
        <button className={btn.ghost}>検索</button>
      </Form>
      <Panel className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
            <tr><th className="p-3">日時（JST）</th><th className="p-3">管理者</th><th className="p-3">操作</th><th className="p-3">対象</th><th className="p-3">詳細</th><th className="p-3">IP</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-white/5">
            {loaderData.logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap p-3 text-xs tabular-nums text-stone-500">{l.created_at}</td>
                <td className="p-3 text-xs">{l.email}</td>
                <td className="p-3">{LABELS[l.action] ?? l.action}</td>
                <td className="p-3 text-xs text-stone-500">{l.target}</td>
                <td className="max-w-xs truncate p-3 text-xs text-stone-400" title={l.detail ?? ""}>{l.detail}</td>
                <td className="p-3 text-xs text-stone-400">{l.ip ?? "—"}</td>
              </tr>
            ))}
            {loaderData.logs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-stone-500">記録はまだありません。</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
