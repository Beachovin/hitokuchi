import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/settings";
import { audit, requireAdmin } from "~/lib/admin.server";
import { getSettings, saveSettings } from "~/lib/settings.server";
import { CLAUDE_MODELS } from "~/lib/models";
import { validateRakutenAdCode } from "~/lib/rakuten-ad";
import { RakutenAd } from "~/components/ad-slot";
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
  // 楽天の広告コードは、楽天以外のものが紛れていないかを確認してから保存する
  const sp = validateRakutenAdCode(String(form.get("rakuten_ad_sp") ?? ""));
  const pc = validateRakutenAdCode(String(form.get("rakuten_ad_pc") ?? ""));
  const adErrors = { sp: "error" in sp ? sp.error : null, pc: "error" in pc ? pc.error : null };
  if (adErrors.sp || adErrors.pc) return { saved: false as const, adErrors, adInput: { sp: String(form.get("rakuten_ad_sp") ?? ""), pc: String(form.get("rakuten_ad_pc") ?? "") } };
  await saveSettings(env.DB, {
    rakuten_ads_enabled: form.get("rakuten_ads_enabled") === "on" ? "1" : "0",
    rakuten_ad_sp: "code" in sp ? sp.code : "",
    rakuten_ad_pc: "code" in pc ? pc.code : "",
    ads_enabled: form.get("ads_enabled") === "on" ? "1" : "0",
    adsense_client: /^ca-pub-\d{10,20}$/.test(client) ? client : "",
    adsense_slot: /^\d{5,20}$/.test(str("adsense_slot")) ? str("adsense_slot") : "",
    amazon_tag: /^[\w-]{1,40}$/.test(str("amazon_tag")) ? str("amazon_tag") : "",
    rakuten_affiliate_id: /^[\w.]{1,60}$/.test(str("rakuten_affiliate_id")) ? str("rakuten_affiliate_id") : "",
    use_claude: form.get("use_claude") === "on" ? "1" : "0",
    operator_name: str("operator_name").slice(0, 80),
    operator_contact: /^(https:\/\/\S{1,200}|[^\s@]{1,64}@[^\s@]{1,190})$/.test(str("operator_contact")) ? str("operator_contact") : "",
    auto_publish: form.get("auto_publish") === "on" ? "1" : "0",
    ai_summary_enabled: form.get("ai_summary_enabled") === "on" ? "1" : "0",
    digest_enabled: form.get("digest_enabled") === "on" ? "1" : "0",
    claude_model: CLAUDE_MODELS.some((m) => m.id === model) ? model : "claude-haiku-5-5",
    max_items_per_source: String(Math.min(200, Math.max(1, Number(form.get("max_items_per_source")) || 80))),
  });
  await audit(env, request, admin, "settings.update", null, Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  return { saved: true as const };
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { settings, hasKey, hasMail } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <Form method="post" className="max-w-2xl">
      <PageTitle title="設定">
        <button className={btn.primary} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
      </PageTitle>
      {actionData && !actionData.saved && (
        <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">楽天の広告コードに問題があるため、保存していません。「楽天の画像広告」の欄を確認してください。</p>
      )}
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

        <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-stone-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-brand-300 dark:ring-white/10 dark:has-[:checked]:bg-brand-500/10">
          <input type="checkbox" name="auto_publish" defaultChecked={settings.auto_publish} className="peer sr-only" />
          <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-stone-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 dark:bg-stone-700" />
          <span>
            <span className="block font-semibold">承認せずにそのまま公開する</span>
            <span className="mt-0.5 block text-sm text-stone-500">
              収集した商品を承認待ちにせず、すぐサイトに公開します。同じコンビニの公開済み商品（直近 60 日）や同時に集めた商品と名前がほぼ同じものは、重複の可能性ありとして自動で除外します。
            </span>
          </span>
        </label>

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
          <p className="mt-1 text-sm text-stone-500">トップ・商品一覧・商品詳細・週間まとめ・特集の広告枠に AdSense の広告を表示します。審査中は「広告枠を表示する」をオフのまま、クライアント ID だけ入れて保存してください（確認用コードと ads.txt が自動で入ります）。</p>
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
        <p className="text-xs text-stone-400">クライアント ID を設定すると、全ページへの確認用コードと /ads.txt が自動で入ります。AdSense の画面で「自動広告」をオンにすると、このスイッチに関係なく Google が広告を差し込むので、最初はオフのままがおすすめです。</p>
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

      <Panel className="mt-6 space-y-5">
        <div>
          <h2 className="font-bold">楽天の画像広告</h2>
          <p className="mt-1 text-sm text-stone-500">
            楽天アフィリエイトのバナーやモーションウィジェットを、AdSense と同じ広告枠（トップ・商品一覧・商品詳細・週間まとめ・特集）に表示します。AdSense の広告が出ている枠では AdSense が優先されます。
          </p>
        </div>
        <Toggle name="rakuten_ads_enabled" defaultChecked={settings.rakuten_ads_enabled} title="楽天の画像広告を表示する" />
        <RakutenCodeField name="rakuten_ad_sp" label="スマホ用の広告コード（幅 300px 前後がおすすめ）" saved={settings.rakuten_ad_sp} input={actionData && !actionData.saved ? actionData.adInput.sp : null} error={actionData && !actionData.saved ? actionData.adErrors.sp : null} />
        <RakutenCodeField name="rakuten_ad_pc" label="PC 用の広告コード（幅 728px 前後がおすすめ。空欄ならスマホ用を使います）" saved={settings.rakuten_ad_pc} input={actionData && !actionData.saved ? actionData.adInput.pc : null} error={actionData && !actionData.saved ? actionData.adErrors.pc : null} />
        <p className="text-xs text-stone-400">
          楽天アフィリエイトの「モーションウィジェット」または「バナー」でコードを作り、表示された HTML をそのまま貼り付けてください。安全のため、楽天以外のサイトを読み込むコードは保存できません。広告はサイト本体から切り離した枠の中で動きます。
        </p>
      </Panel>

      <Panel className="mt-6 space-y-5">
        <div>
          <h2 className="font-bold">運営者情報</h2>
          <p className="mt-1 text-sm text-stone-500">プライバシーポリシーと利用規約に表示されます。広告（AdSense）やアフィリエイトの審査では、運営者と連絡先の記載が求められます。</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">運営者名（個人名・屋号・法人名）</span>
          <input name="operator_name" maxLength={80} defaultValue={settings.operator_name} className={input} placeholder="例：ひとくち運営事務局" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">お問い合わせ先（メールアドレス、または https:// で始まるフォームの URL）</span>
          <input name="operator_contact" maxLength={200} defaultValue={settings.operator_contact} className={input} placeholder="例：contact@example.com" />
        </label>
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

/** 楽天の広告コードの入力欄と、保存済みのコードのプレビュー */
function RakutenCodeField({ name, label, saved, input: value, error }: { name: string; label: string; saved: string; input: string | null; error: string | null }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">{label}</span>
        <textarea name={name} rows={4} defaultValue={value ?? saved} spellCheck={false} placeholder={'<script type="text/javascript">rakuten_design="slide";rakuten_affiliateId="…";…</script>'} className={`${input} font-mono text-xs`} />
      </label>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {saved && !error && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-stone-500">保存済みの広告をプレビュー</summary>
          <div className="mt-2 rounded-xl bg-stone-50 p-3 dark:bg-white/5">
            <RakutenAd sp={saved} pc={saved} preview />
          </div>
        </details>
      )}
    </div>
  );
}
