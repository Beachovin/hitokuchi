import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/sources";
import { audit, requireAdmin } from "~/lib/admin.server";
import { getSettings } from "~/lib/settings.server";
import { Badge, Panel, PageTitle, btn } from "~/components/admin-ui";
import { relativeDate } from "~/lib/format";

type Source = { id: number; name: string; adapter: string | null; url: string; channel_name: string | null; enabled: number; last_run_at: string | null };
type Run = { id: number; source_name: string | null; status: string; found: number; extracted: number; skipped: number; errors: number; input_tokens: number; output_tokens: number; message: string | null; started_at: string; finished_at: string | null };

export async function loader({ request, context }: Route.LoaderArgs) {
  const { DB } = context.cloudflare.env;
  const admin = await requireAdmin(request, context.cloudflare.env);
  const [sources, runs, settings] = await Promise.all([
    DB.prepare("SELECT s.*, c.name AS channel_name FROM scrape_sources s LEFT JOIN channels c ON c.id = s.channel_id WHERE s.adapter IS NOT NULL ORDER BY s.id").all<Source>(),
    DB.prepare("SELECT r.*, s.name AS source_name FROM scrape_runs r LEFT JOIN scrape_sources s ON s.id = r.source_id ORDER BY r.id DESC LIMIT 30").all<Run>(),
    getSettings(DB),
  ]);
  return { sources: sources.results, runs: runs.results, useClaude: settings.use_claude };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = Number(form.get("id"));
  if (intent === "backfill") {
    await audit(env, request, admin, "source.backfill");
    const inst = await env.SCRAPE_WORKFLOW.create({ params: { trigger: "manual", mode: "backfill-details" } });
    return { started: inst.id };
  }
  if (intent === "run-all") {
    await audit(env, request, admin, "source.run", "all");
    const inst = await env.SCRAPE_WORKFLOW.create({ params: { trigger: "manual" } });
    return { started: inst.id };
  }
  if (intent === "toggle") {
    await env.DB.prepare("UPDATE scrape_sources SET enabled = 1 - enabled WHERE id = ?").bind(id).run();
    await audit(env, request, admin, "source.toggle", `source:${id}`);
  } else if (intent === "run") {
    await audit(env, request, admin, "source.run", `source:${id}`);
    const inst = await env.SCRAPE_WORKFLOW.create({ params: { trigger: "manual", sourceId: id } });
    return { started: inst.id };
  }
  return { ok: true };
}

export default function Sources({ loaderData, actionData }: Route.ComponentProps) {
  const { sources, runs, useClaude } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <PageTitle title="収集元・ログ">
        <Form method="post">
          <button name="intent" value="run-all" className={btn.primary} disabled={busy}>🤖 有効な収集元をすべて実行</button>
        </Form>
        <Form method="post">
          <button name="intent" value="backfill" className={btn.ghost} disabled={busy} title="承認済みで説明が未取得の商品について、各社の詳細ページから説明を取得します">📝 商品説明を補完</button>
        </Form>
      </PageTitle>
      <Panel className="mb-6 !py-3 text-sm text-stone-600 dark:text-stone-300">
        収集元はコンビニ 5 社の新商品一覧に限定しています。各サイト 1 ページ（ミニストップは公開 JSON）だけを取得し、robots.txt を守ります。
        整形モード：<strong>{useClaude ? "ルール ＋ Claude" : "ルールのみ"}</strong>（<a href="/admin/settings" className="underline">設定で変更</a>）
      </Panel>
      {actionData && "started" in actionData && (
        <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">収集を開始しました（{actionData.started}）。</p>
      )}

      <div>
        <Panel className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
              <tr><th className="p-3">名前</th><th className="p-3">販売店</th><th className="p-3">最終実行</th><th className="p-3">状態</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/5">
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="p-3">
                    <p className="font-medium">{s.name}</p>
                    <p className="max-w-xs truncate text-xs text-stone-400">{s.url}</p>
                  </td>
                  <td className="p-3 text-stone-500">{s.channel_name ?? "—"}</td>
                  <td className="p-3 text-xs text-stone-500">{s.last_run_at ? relativeDate(s.last_run_at) : "未実行"}</td>
                  <td className="p-3"><Badge tone={s.enabled ? "green" : "stone"}>{s.enabled ? "有効" : "停止中"}</Badge></td>
                  <td className="p-3">
                    <Form method="post" className="flex justify-end gap-1.5">
                      <input type="hidden" name="id" value={s.id} />
                      <button name="intent" value="run" className={btn.ghost} disabled={busy}>実行</button>
                      <button name="intent" value="toggle" className={btn.ghost} disabled={busy}>{s.enabled ? "停止" : "有効化"}</button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

      </div>

      <h2 className="mb-3 mt-10 text-lg font-bold">実行ログ</h2>
      <Panel className="overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-100 text-left text-xs text-stone-500 dark:border-white/5">
            <tr><th className="p-3">開始</th><th className="p-3">収集元</th><th className="p-3">状態</th><th className="p-3 text-right">発見</th><th className="p-3 text-right">抽出</th><th className="p-3 text-right">スキップ</th><th className="p-3 text-right">エラー</th><th className="p-3 text-right">トークン(入/出)</th><th className="p-3">メッセージ</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100 tabular-nums dark:divide-white/5">
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="p-3 text-xs text-stone-500">{relativeDate(r.started_at)}</td>
                <td className="p-3">{r.source_name ?? "（商品説明の補完）"}</td>
                <td className="p-3"><Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "blue"}>{r.status}</Badge></td>
                <td className="p-3 text-right">{r.found}</td>
                <td className="p-3 text-right">{r.extracted}</td>
                <td className="p-3 text-right">{r.skipped}</td>
                <td className="p-3 text-right">{r.errors}</td>
                <td className="p-3 text-right text-xs">{r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}</td>
                <td className="max-w-xs truncate p-3 text-xs text-stone-500" title={r.message ?? ""}>{r.message}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-stone-500">まだ実行履歴がありません。</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
