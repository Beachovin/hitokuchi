import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/settings";
import { audit, requireAdmin } from "~/lib/admin.server";
import { getSettings, saveSettings } from "~/lib/settings.server";
import { CLAUDE_MODELS } from "~/lib/models";
import { Panel, PageTitle, btn, input } from "~/components/admin-ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  return { settings: await getSettings(env.DB), hasKey: !!env.ANTHROPIC_API_KEY, hasMail: !!(env.RESEND_API_KEY && env.DIGEST_FROM && env.SITE_ORIGIN) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const form = await request.formData();
  const model = String(form.get("claude_model"));
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const client = str("adsense_client");
  await saveSettings(env.DB, {
    ads_enabled: form.get("ads_enabled") === "on" ? "1" : "0",
    adsense_client: /^ca-pub-\d{10,20}$/.test(client) ? client : "",
    adsense_slot: /^\d{5,20}$/.test(str("adsense_slot")) ? str("adsense_slot") : "",
    amazon_tag: /^[\w-]{1,40}$/.test(str("amazon_tag")) ? str("amazon_tag") : "",
    rakuten_affiliate_id: /^[\w.]{1,60}$/.test(str("rakuten_affiliate_id")) ? str("rakuten_affiliate_id") : "",
    use_claude: form.get("use_claude") === "on" ? "1" : "0",
    ai_summary_enabled: form.get("ai_summary_enabled") === "on" ? "1" : "0",
    digest_enabled: form.get("digest_enabled") === "on" ? "1" : "0",
    claude_model: CLAUDE_MODELS.some((m) => m.id === model) ? model : "claude-haiku-5-5",
    max_items_per_source: String(Math.min(200, Math.max(1, Number(form.get("max_items_per_source")) || 80))),
  });
  await audit(env, request, admin, "settings.update", null, Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  return { saved: true };
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, hasKey, hasMail } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className="max-w-2xl">
      <PageTitle title="設定">
        <button className={btn.primary} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
      </PageTitle>
      {actionData?.saved && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">保存しました。次回の収集から反映されます。</p>}

      <Panel className="space-y-5">
        <div>
          <h2 className="font-bold">収集データの整形</h2>
          <p className="mt-1 text-sm text-stone-500">
            収集した商品は、常にルールベースで整形（価格の税込換算・発売日の統一・商品名の表記揺れ・カテゴリ推定・食品以外の除外）してから承認待ちに入ります。
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-stone-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-300 dark:ring-white/10 dark:has-[:checked]:bg-brand-500/10">
          <input type="checkbox" name="use_claude" defaultChecked={settings.use_claude} className="peer sr-only" />
          <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-stone-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 dark:bg-stone-700" />
          <span>
            <span className="block font-semibold">Claude で仕上げ整形する</span>
            <span className="mt-0.5 block text-sm text-stone-500">
              ルール整形の後に、商品名の整え・カテゴリ判定・食品かどうかの判定を Claude が行います。一覧をまとめて送るため、1 サイトあたり 1〜3 回の呼び出し（目安：月数十円）です。
            </span>
          </span>
        </label>
        {!hasKey && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            ⚠️ ANTHROPIC_API_KEY が未設定です。ON にしてもルール整形のみで実行されます（本番：<code>wrangler secret put ANTHROPIC_API_KEY</code>／ローカル：<code>.dev.vars</code>）。
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">使用するモデル</span>
          <select name="claude_model" defaultValue={settings.claude_model} className={input}>
            {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">1 サイトあたりの最大取り込み件数</span>
          <input name="max_items_per_source" type="number" min={1} max={200} defaultValue={settings.max_items_per_source} className={input} />
        </label>
      </Panel>

      <Panel className="mt-6 space-y-5">
        <div>
          <h2 className="font-bold">口コミの AI 要約</h2>
          <p className="mt-1 text-sm text-stone-500">口コミが5件以上集まった商品で、「みんなの声まとめ」を Claude が自動生成します（その後は3件増えるごとに更新）。</p>
        </div>
        <Toggle name="ai_summary_enabled" defaultChecked={settings.ai_summary_enabled} title="AI 要約を有効にする" />
        {!hasKey && <p className="text-xs text-amber-700">ANTHROPIC_API_KEY が未設定のため、現在は生成されません。</p>}
      </Panel>

      <Panel className="mt-6 space-y-5">
        <div>
          <h2 className="font-bold">週1回のダイジェストメール</h2>
          <p className="mt-1 text-sm text-stone-500">毎週月曜 8:00 に、受け取りを設定したユーザーへ「気になる」商品の発売情報とおすすめを送信します（Resend を使用）。</p>
        </div>
        <Toggle name="digest_enabled" defaultChecked={settings.digest_enabled} title="ダイジェストの送信を有効にする" />
        {!hasMail && <p className="text-xs text-amber-700">RESEND_API_KEY・DIGEST_FROM・SITE_ORIGIN が未設定のため、現在は送信されません。</p>}
      </Panel>

      <Panel className="mt-6 space-y-5">
        <div>
          <h2 className="font-bold">広告（Google AdSense）</h2>
          <p className="mt-1 text-sm text-stone-500">トップ・商品一覧・商品詳細・週間まとめに広告枠を表示します。ID 未設定のまま ON にすると、配置確認用の枠が表示されます。</p>
        </div>
        <Toggle name="ads_enabled" defaultChecked={settings.ads_enabled} title="広告枠を表示する" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">クライアント ID</span>
            <input name="adsense_client" defaultValue={settings.adsense_client} placeholder="ca-pub-0000000000000000" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">広告ユニット ID</span>
            <input name="adsense_slot" defaultValue={settings.adsense_slot} placeholder="1234567890" className={input} />
          </label>
        </div>
        <p className="text-xs text-stone-400">クライアント ID を設定すると /ads.txt も自動で配信されます。</p>
      </Panel>

      <Panel className="mt-6 space-y-5">
        <div>
          <h2 className="font-bold">アフィリエイト</h2>
          <p className="mt-1 text-sm text-stone-500">お菓子・チョコ・ドリンク・カップ麺の商品ページに「通販で探す」リンクを「PR」表記つきで表示します。空欄のサービスは表示しません。</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Amazon アソシエイト トラッキング ID</span>
            <input name="amazon_tag" defaultValue={settings.amazon_tag} placeholder="example-22" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">楽天アフィリエイト ID</span>
            <input name="rakuten_affiliate_id" defaultValue={settings.rakuten_affiliate_id} placeholder="0000000.00000000" className={input} />
          </label>
        </div>
      </Panel>
    </Form>
  );
}

function Toggle({ name, defaultChecked, title }: { name: string; defaultChecked: boolean; title: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-stone-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 dark:bg-stone-700" />
      <span className="font-semibold">{title}</span>
    </label>
  );
}
