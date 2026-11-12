import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getSettings } from "../app/lib/settings.server";
import { ADAPTERS, type AdapterName } from "./scrape/adapters";
import { refineWithClaude } from "./scrape/claude-normalize";
import { isAllowedByRobots, politeFetch } from "./scrape/fetch";
import { normalizeByRules, normalizeKey, parseKcal, type Normalized } from "./scrape/normalize";

type Params = { trigger: "cron" | "manual"; sourceId?: number; mode?: "collect" | "backfill-details" };
type Source = { id: number; name: string; adapter: AdapterName; url: string; max_items: number };
type Totals = { found: number; extracted: number; skipped: number; errors: number; input: number; output: number };

const RETRY = { retries: { limit: 2, delay: "15 seconds", backoff: "exponential" }, timeout: "2 minutes" } as const;
const CLAUDE_BATCH = 30;
const DETAIL_LIMIT_PER_SOURCE = 60; // 1 回の収集で詳細ページを取得する上限（残りは「商品説明を補完」で取得）
const BACKFILL_LIMIT = 120;

/**
 * コンビニ新商品の収集パイプライン
 *   収集元ごとに: 一覧ページを 1 回取得 → アダプターで商品を抽出 → 既知の商品を除外
 *   → ルールで整形 →（設定 ON なら）Claude で仕上げ → 承認待ちに保存
 */
export class ScrapeWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { DB } = this.env;
    if (event.payload.mode === "backfill-details") return this.backfillDetails(step);

    const { settings, sources } = await step.do("load settings and sources", async () => {
      const settings = await getSettings(DB);
      const q = event.payload.sourceId
        ? DB.prepare("SELECT id, name, adapter, url, max_items FROM scrape_sources WHERE id = ? AND adapter IS NOT NULL").bind(event.payload.sourceId)
        : DB.prepare("SELECT id, name, adapter, url, max_items FROM scrape_sources WHERE enabled = 1 AND adapter IS NOT NULL");
      return { settings, sources: (await q.all<Source>()).results };
    });
    const useClaude = settings.use_claude && !!this.env.ANTHROPIC_API_KEY;

    for (const [si, src] of sources.entries()) {
      const adapter = ADAPTERS[src.adapter];
      if (!adapter) continue;
      const runId = await step.do(`start run ${src.id}`, async () => {
        const row = await DB.prepare("INSERT INTO scrape_runs(source_id, instance_id) VALUES (?, ?) RETURNING id").bind(src.id, event.instanceId).first<{ id: number }>();
        return row!.id;
      });
      const totals: Totals = { found: 0, extracted: 0, skipped: 0, errors: 0, input: 0, output: 0 };
      const notes: string[] = [];

      try {
        // 1. 一覧ページを取得して商品を抽出
        const raw = await step.do(`fetch ${src.id}`, RETRY, async () => {
          if (!(await isAllowedByRobots(src.url))) throw new Error(`robots.txt で禁止されています: ${src.url}`);
          const page = await politeFetch(src.url);
          const items = adapter.parse(page.body, page.url);
          if (items.length === 0) throw new Error("商品が 0 件でした（ページ構造が変わった可能性があります）");
          return items.slice(0, Math.min(src.max_items, settings.max_items_per_source));
        });
        totals.found = raw.length;

        // 2. 既に候補・商品になっているものを除外し、ルールで整形
        let items = await step.do(`normalize ${src.id}`, async () => {
          const keys = raw.map((r) => `${src.adapter}:${r.externalId}`);
          const known = new Set<string>();
          for (let i = 0; i < keys.length; i += 90) {
            const chunk = keys.slice(i, i + 90);
            const { results } = await DB.prepare(`SELECT external_key FROM product_candidates WHERE external_key IN (${chunk.map(() => "?").join(",")})`)
              .bind(...chunk)
              .all<{ external_key: string }>();
            results.forEach((r) => known.add(r.external_key));
          }
          // 同じチェーンで同名の商品（地域違いで商品コードが別など）は 1 件にまとめる
          const { results: sameChain } = await DB.prepare(
            "SELECT name FROM product_candidates WHERE external_key LIKE ? AND status != 'rejected' AND created_at >= datetime('now', '-60 days')",
          )
            .bind(`${src.adapter}:%`)
            .all<{ name: string }>();
          const existingNames = new Set(sameChain.map((r) => normalizeKey(r.name)));
          const today = new Date(Date.now() + 9 * 3600_000); // JST
          const kept = new Map<string, Normalized>();
          for (const r of raw) {
            if (known.has(`${src.adapter}:${r.externalId}`)) continue;
            const n = normalizeByRules(r, today);
            const k = normalizeKey(n.name);
            if (existingNames.has(k)) continue;
            const prev = kept.get(k);
            if (prev) {
              // 地域違いの同一商品は販売地域をまとめる
              const regions = new Set([...(prev.region?.split("、") ?? []), ...(n.region?.split("、") ?? [])].filter(Boolean));
              prev.region = regions.size ? [...regions].join("、").slice(0, 300) : null;
              continue;
            }
            kept.set(k, n);
          }
          return [...kept.values()];
        });
        totals.skipped += raw.length - items.length;

        // 3. 詳細ページから商品説明・カロリーを取得（新しい商品だけ、間隔を空けて）
        if (adapter.detail) {
          const targets = items.filter((n) => n.isFood && !n.description && /^https?:/.test(n.url) && !n.url.includes("#")).slice(0, DETAIL_LIMIT_PER_SOURCE);
          for (const [di, n] of targets.entries()) {
            try {
              const info = await step.do(`detail ${src.id}:${n.externalId}`, RETRY, () => fetchDetail(adapter, n.url));
              n.description = info.description;
              n.kcal = n.kcal ?? parseKcal(info.kcalText);
            } catch (e) {
              notes.push(`詳細取得に失敗: ${n.name}`);
            }
            if (di < targets.length - 1) await step.sleep(`detail wait ${src.id}:${di}`, "2 seconds");
          }
        }

        // 4. 設定が ON なら Claude で仕上げ（失敗したバッチはルール整形の結果をそのまま使う）
        let normalizedBy: "rules" | "claude" = "rules";
        if (useClaude && items.length) {
          const refined: Normalized[] = [];
          for (let i = 0; i < items.length; i += CLAUDE_BATCH) {
            const batch = items.slice(i, i + CLAUDE_BATCH);
            try {
              const r = await step.do(`claude ${src.id}:${i}`, RETRY, () => refineWithClaude(this.env.ANTHROPIC_API_KEY, settings.claude_model, batch));
              refined.push(...r.refined);
              totals.input += r.usage.input;
              totals.output += r.usage.output;
              normalizedBy = "claude";
            } catch (e) {
              refined.push(...batch);
              totals.errors++;
              notes.push(`Claude 整形に失敗（ルール整形で継続）: ${String(e).slice(0, 120)}`);
            }
          }
          items = refined;
        }

        // 5. 食品だけを承認待ちに保存
        const saved = await step.do(`save ${src.id}`, async () => {
          const products = (await DB.prepare("SELECT id, name FROM products ORDER BY id DESC LIMIT 3000").all<{ id: number; name: string }>()).results;
          const byKey = new Map(products.map((p) => [normalizeKey(p.name), p.id]));
          const firstSeen = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
          const food = items.filter((n) => n.isFood);
          const stmts = food.map((n) =>
            DB.prepare(
              `INSERT INTO product_candidates(source_id, run_id, source_url, name, maker, category_hint, price, kcal, released_on, description, image_url, confidence, duplicate_of, external_key, region, normalized_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(
              // 発売日が載っていないサイト（デイリーヤマザキ等）は初回取得日を発売日とみなす
              src.id, runId, n.url, n.name, adapter.label, n.category, n.price, n.kcal, n.releasedOn ?? firstSeen, n.description, n.imageUrl, n.confidence,
              byKey.get(normalizeKey(n.name)) ?? null, `${src.adapter}:${n.externalId}`, n.region, normalizedBy,
            ),
          );
          for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
          return { saved: food.length, nonFood: items.filter((n) => !n.isFood).map((n) => n.name) };
        });
        totals.extracted = saved.saved;
        totals.skipped += saved.nonFood.length;
        if (saved.nonFood.length) notes.push(`食品以外として除外: ${saved.nonFood.slice(0, 5).join("、")}${saved.nonFood.length > 5 ? " ほか" : ""}`);
        if (!useClaude && settings.use_claude) notes.push("Claude 整形が ON ですが ANTHROPIC_API_KEY が未設定のためルール整形のみ実行");

        await step.do(`finish run ${src.id}`, () => finishRun(DB, runId, src.id, "succeeded", totals, notes.join(" / ") || null));
      } catch (e) {
        totals.errors++;
        await step.do(`fail run ${src.id}`, () => finishRun(DB, runId, src.id, "failed", totals, [String(e), ...notes].join(" / ")));
      }

      // 次のサイトへ行く前に少し間隔を空ける
      if (si < sources.length - 1) await step.sleep(`wait after ${src.id}`, "3 seconds");
    }
  }

  /** 承認済みで説明が未取得の商品について、詳細ページから説明・カロリーを補完する */
  private async backfillDetails(step: WorkflowStep) {
    const { DB } = this.env;
    const targets = await step.do("backfill targets", async () => {
      const { results } = await DB.prepare(
        `SELECT p.id, p.source_url,
                (SELECT substr(c.external_key, 1, instr(c.external_key, ':') - 1) FROM product_candidates c WHERE c.duplicate_of = p.id AND c.external_key IS NOT NULL LIMIT 1) AS adapter
         FROM products p
         WHERE p.description IS NULL AND p.detail_fetched_at IS NULL AND p.source_url LIKE 'http%' AND p.source_url NOT LIKE '%#%'
         ORDER BY p.released_on DESC LIMIT ?`,
      )
        .bind(BACKFILL_LIMIT)
        .all<{ id: number; source_url: string; adapter: AdapterName | null }>();
      return results.filter((r) => r.adapter && ADAPTERS[r.adapter]?.detail);
    });
    const runId = await step.do("backfill start", async () => {
      const row = await DB.prepare("INSERT INTO scrape_runs(source_id, instance_id, message) VALUES (NULL, ?, '商品説明の補完') RETURNING id").bind(`backfill-${Date.now()}`).first<{ id: number }>();
      return row!.id;
    });
    let ok = 0;
    let failed = 0;
    for (const [i, t] of targets.entries()) {
      try {
        await step.do(`backfill ${t.id}`, RETRY, async () => {
          const info = await fetchDetail(ADAPTERS[t.adapter!], t.source_url);
          await DB.prepare("UPDATE products SET description = COALESCE(description, ?), kcal = COALESCE(kcal, ?), detail_fetched_at = datetime('now') WHERE id = ?")
            .bind(info.description, parseKcal(info.kcalText), t.id)
            .run();
        });
        ok++;
      } catch {
        failed++;
      }
      if (i < targets.length - 1) await step.sleep(`backfill wait ${i}`, "2 seconds");
    }
    await step.do("backfill finish", async () => {
      await DB.prepare("UPDATE scrape_runs SET status=?, found=?, extracted=?, errors=?, message=?, finished_at=datetime('now') WHERE id=?")
        .bind(failed && !ok ? "failed" : "succeeded", targets.length, ok, failed, `商品説明の補完：${ok}件取得`, runId)
        .run();
    });
  }
}

async function fetchDetail(adapter: (typeof ADAPTERS)[AdapterName], url: string) {
  if (!(await isAllowedByRobots(url))) return { description: null, kcalText: null };
  const page = await politeFetch(url);
  return adapter.detail!(page.body);
}

async function finishRun(db: D1Database, runId: number, sourceId: number, status: "succeeded" | "failed", t: Totals, message: string | null) {
  await db.batch([
    db
      .prepare("UPDATE scrape_runs SET status=?, found=?, extracted=?, skipped=?, errors=?, input_tokens=?, output_tokens=?, message=?, finished_at=datetime('now') WHERE id=?")
      .bind(status, t.found, t.extracted, t.skipped, t.errors, t.input, t.output, message, runId),
    db.prepare("UPDATE scrape_sources SET last_run_at = datetime('now') WHERE id = ?").bind(sourceId),
  ]);
}
