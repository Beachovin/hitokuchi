import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/dashboard";
import { audit, requireAdmin } from "~/lib/admin.server";
import { generateNotifications } from "~/lib/engage.server";
import { summarizePending } from "~/lib/summary.server";
import { addDays, mondayOf, todayJst } from "~/lib/weeks";
import { generateWeeklyBattles } from "~/lib/battles.server";
import { runMaintenance, type MaintenanceResult } from "~/lib/retention.server";
import { startCollection } from "~/lib/collect.server";
import { Badge, Panel, PageTitle, btn } from "~/components/admin-ui";
import { relativeDate } from "~/lib/format";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { DB } = context.cloudflare.env;
  const admin = await requireAdmin(request, context.cloudflare.env);
  const stats = await DB.prepare(
    `SELECT (SELECT COUNT(*) FROM products WHERE status='published') AS products,
            (SELECT COUNT(*) FROM reviews WHERE status='published') AS reviews,
            (SELECT COUNT(*) FROM reviews WHERE created_at >= datetime('now','-7 days')) AS reviews7d,
            (SELECT COUNT(*) FROM product_candidates WHERE status='pending') AS pending,
            (SELECT COALESCE(SUM(input_tokens),0) FROM scrape_runs WHERE started_at >= datetime('now','start of month')) AS in_tok,
            (SELECT COALESCE(SUM(output_tokens),0) FROM scrape_runs WHERE started_at >= datetime('now','start of month')) AS out_tok`,
  ).first<Record<string, number>>();
  const { results: runs } = await DB.prepare(
    `SELECT r.*, s.name AS source_name FROM scrape_runs r LEFT JOIN scrape_sources s ON s.id = r.source_id ORDER BY r.id DESC LIMIT 8`,
  ).all<{ id: number; source_name: string | null; status: string; found: number; extracted: number; skipped: number; errors: number; message: string | null; started_at: string }>();
  const m = await DB.prepare("SELECT value FROM settings WHERE key = 'maintenance_last'").first<{ value: string }>();
  let maintenance: MaintenanceResult | null = null;
  try {
    maintenance = m ? (JSON.parse(m.value) as MaintenanceResult) : null;
  } catch {}
  return { stats: stats!, runs, maintenance };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const intent = (await request.formData()).get("intent");
  await audit(env, request, admin, `dashboard.${intent === "notify" || intent === "summary" || intent === "battles" || intent === "maintenance" ? intent : "collect"}`);
  if (intent === "battles") {
    const week = mondayOf(todayJst());
    const r = await generateWeeklyBattles(env.DB, week, addDays(week, 6));
    return { message: r.created ? `今週のバトルを ${r.created} ジャンル分作成しました` : "新しく作成できるジャンルはありませんでした（各ジャンル 2 商品以上が必要です）" };
  }
  if (intent === "maintenance") {
    const r = await runMaintenance(env);
    return { message: `後片付けを実行しました（古い商品 ${r.purge?.products ?? 0}件・未使用の画像 ${r.images?.deleted ?? 0}個を削除${r.errors.length ? `／失敗 ${r.errors.length}件` : ""}）` };
  }
  if (intent === "notify") {
    const r = await generateNotifications(env.DB, todayJst());
    return { message: `通知を生成しました（発売日 ${r.releaseToday}件・口コミのお願い ${r.askReview}件）` };
  }
  if (intent === "summary") {
    const r = await summarizePending(env);
    return { message: env.ANTHROPIC_API_KEY ? `AI 要約：対象 ${r.targets}件中 ${r.done}件を生成${r.errors.length ? `（失敗 ${r.errors.length}件）` : ""}` : "ANTHROPIC_API_KEY が未設定のため生成できません" };
  }
  const r = await startCollection(env, "manual");
  return { started: `${r.started} 件の収集元を順番に実行します（約 ${r.finishesAfterMinutes + 5} 分で完了）` };
}

// Haiku 5.5: $0.10 / $0.50 per 1M tokens（100K 以下のプロンプト）
const costYen = (inTok: number, outTok: number) => Math.round(((inTok * 0.1 + outTok * 0.5) / 1_000_000) * 150);

export default function Dashboard({ loaderData, actionData }: Route.ComponentProps) {
  const { stats, runs, maintenance } = loaderData;
  const nav = useNavigation();
  const cards = [
    ["公開中の商品", stats.products, "🍱"],
    ["公開中の口コミ", stats.reviews, "💬"],
    ["直近7日の口コミ", stats.reviews7d, "📈"],
    ["承認待ち", stats.pending, "📥"],
  ] as const;
  return (
    <>
      <PageTitle title="ダッシュボード">
        <Form method="post" className="flex flex-wrap gap-2">
          <button name="intent" value="battles" className={btn.ghost} disabled={nav.state !== "idle"}>⚔️ バトルを今すぐ作成</button>
          <button name="intent" value="notify" className={btn.ghost} disabled={nav.state !== "idle"}>🔔 通知を今すぐ生成</button>
          <button name="intent" value="maintenance" className={btn.ghost} disabled={nav.state !== "idle"}>🧹 後片付けを今すぐ実行</button>
          <button name="intent" value="summary" className={btn.ghost} disabled={nav.state !== "idle"}>✨ AI 要約を生成</button>
          <button name="intent" value="collect" className={btn.primary} disabled={nav.state !== "idle"}>
            🤖 今すぐ収集を実行
          </button>
        </Form>
      </PageTitle>
      {actionData && "message" in actionData && (
        <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{actionData.message}</p>
      )}
      {actionData && "started" in actionData && (
        <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
          収集ワークフローを開始しました（{actionData.started}）。数分後にログを確認してください。
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(([label, v, icon]) => (
          <Panel key={label}>
            <p className="text-sm text-stone-500">
              {icon} {label}
            </p>
            <p className="mt-2 text-3xl font-black tabular-nums">{v.toLocaleString()}</p>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">最近の収集ログ</h2>
            <Link to="/admin/sources" className="text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">すべて →</Link>
          </div>
          {runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">まだ実行履歴がありません。</p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-white/5">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "blue"}>{r.status}</Badge>
                  <span className="font-medium">{r.source_name ?? "(削除済み)"}</span>
                  <span className="text-stone-500">発見 {r.found} / 抽出 {r.extracted} / スキップ {r.skipped} / エラー {r.errors}</span>
                  <span className="ml-auto text-xs text-stone-400">{relativeDate(r.started_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <h2 className="font-bold">今月の Claude API 利用</h2>
          <p className="mt-3 text-3xl font-black">約 ¥{costYen(stats.in_tok, stats.out_tok).toLocaleString()}</p>
          <p className="mt-2 text-xs text-stone-500">
            入力 {stats.in_tok.toLocaleString()} / 出力 {stats.out_tok.toLocaleString()} トークン
            <br />
            Haiku 5.5 の料金・1ドル150円で試算
          </p>
        </Panel>
      </div>
      <Panel className="mt-6">
        <h2 className="font-bold">毎朝の後片付け</h2>
        {maintenance ? (
          <div className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            <p>最終実行：{relativeDate(maintenance.at.replace("T", " ").slice(0, 19))}</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              <li>発売から1か月を過ぎた商品：{maintenance.purge?.products ?? 0}件を削除（口コミ {maintenance.purge?.reviews ?? 0}件）</li>
              <li>使われていない画像：{maintenance.images?.scanned ?? 0}個を確認し {maintenance.images?.deleted ?? 0}個を削除</li>
              <li>期限切れのログイン情報：{maintenance.records?.sessions ?? 0}件を削除</li>
              <li>古い通知・監査ログ：{(maintenance.records?.notifications ?? 0) + (maintenance.records?.audits ?? 0)}件を削除</li>
            </ul>
            {maintenance.errors.length > 0 && <p className="mt-2 text-rose-600">失敗：{maintenance.errors.join(" / ")}</p>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">まだ実行されていません（毎朝 6 時に自動で実行されます）。</p>
        )}
      </Panel>
    </>
  );
}
