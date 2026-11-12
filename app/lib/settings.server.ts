// 管理画面から変更できる設定（D1 の settings テーブル）

export type Settings = {
  use_claude: boolean;
  /** スクレイピング結果を承認待ちにせず、重複を除いてそのまま公開する */
  auto_publish: boolean;
  claude_model: string;
  max_items_per_source: number;
  ads_enabled: boolean;
  adsense_client: string;
  adsense_slot: string;
  amazon_tag: string;
  rakuten_affiliate_id: string;
  digest_enabled: boolean;
  ai_summary_enabled: boolean;
  /** 運営者名とお問い合わせ先（プライバシーポリシー・利用規約に表示） */
  operator_name: string;
  operator_contact: string;
  /** 楽天の画像広告（バナー・ウィジェット）を広告枠に表示する */
  rakuten_ads_enabled: boolean;
  /** 楽天の広告コード（スマホ用・PC 用。片方だけでもよい） */
  rakuten_ad_sp: string;
  rakuten_ad_pc: string;
};

/** お客様向け画面に渡してよい設定だけ（API キー等は含めない） */
export type PublicSettings = Pick<Settings, "ads_enabled" | "adsense_client" | "adsense_slot" | "amazon_tag" | "rakuten_affiliate_id" | "operator_name" | "operator_contact" | "rakuten_ads_enabled" | "rakuten_ad_sp" | "rakuten_ad_pc">;

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const m = new Map(results.map((r) => [r.key, r.value]));
  return {
    use_claude: m.get("use_claude") === "1",
    auto_publish: m.get("auto_publish") === "1",
    claude_model: m.get("claude_model") || "claude-haiku-5-5",
    max_items_per_source: Number(m.get("max_items_per_source")) || 80,
    ads_enabled: m.get("ads_enabled") === "1",
    adsense_client: m.get("adsense_client") ?? "",
    adsense_slot: m.get("adsense_slot") ?? "",
    amazon_tag: m.get("amazon_tag") ?? "",
    rakuten_affiliate_id: m.get("rakuten_affiliate_id") ?? "",
    digest_enabled: m.get("digest_enabled") === "1",
    ai_summary_enabled: m.get("ai_summary_enabled") !== "0",
    operator_name: m.get("operator_name") ?? "",
    operator_contact: m.get("operator_contact") ?? "",
    rakuten_ads_enabled: m.get("rakuten_ads_enabled") === "1",
    rakuten_ad_sp: m.get("rakuten_ad_sp") ?? "",
    rakuten_ad_pc: m.get("rakuten_ad_pc") ?? "",
  };
}

export async function getPublicSettings(db: D1Database): Promise<PublicSettings> {
  const s = await getSettings(db);
  return {
    ads_enabled: s.ads_enabled,
    adsense_client: s.adsense_client,
    adsense_slot: s.adsense_slot,
    amazon_tag: s.amazon_tag,
    rakuten_affiliate_id: s.rakuten_affiliate_id,
    operator_name: s.operator_name,
    operator_contact: s.operator_contact,
    rakuten_ads_enabled: s.rakuten_ads_enabled,
    // 広告がオフのときはコードを画面に渡さない
    rakuten_ad_sp: s.rakuten_ads_enabled ? s.rakuten_ad_sp : "",
    rakuten_ad_pc: s.rakuten_ads_enabled ? s.rakuten_ad_pc : "",
  };
}

export async function saveSettings(db: D1Database, s: Partial<Record<keyof Settings, string>>) {
  const stmts = Object.entries(s)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) =>
      db
        .prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(k, v!),
    );
  if (stmts.length) await db.batch(stmts);
}
