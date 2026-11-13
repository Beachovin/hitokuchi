import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { getSettings } from "../app/lib/settings.server";
import { ADAPTERS, type AdapterName, type RawItem } from "./scrape/adapters";
import { refineWithClaude } from "./scrape/claude-normalize";
import { fetchRobots, listHash, politeFetch, robotsAllows, type RobotsRules } from "./scrape/fetch";
import { autoPublish } from "../app/lib/candidates.server";
import { knownKeys } from "./scrape/known";
import { normalizeByRules, normalizeKey, parseKcal, type Normalized } from "./scrape/normalize";

type Params = { trigger: "cron" | "manual"; sourceId?: number; mode?: "collect" | "backfill-details"; startAfterMinutes?: number };
// 手動実行は更新が無くても必ず処理する。定期実行は一覧が変わったときだけ処理する
type Source = { id: number; name: string; adapter: AdapterName; url: string; max_items: number; list_hash: string | null; etag: string | null; last_modified: string | null };
type Totals = { found: number; extracted: number; skipped: number; errors: number; input: number; output: number };

const RETRY = { retries: { limit: 2, delay: "15 seconds", backoff: "exponential" }, timeout: "2 minutes" } as const;
const CLAUDE_BATCH = 30;
// 無料プランでは、1 回のワークフロー実行で外部サイトへ送れるリクエストは 50 件まで。
// 収集元ごとに別の実行に分け、robots.txt は 1 サイト 1 回だけ取得し、詳細ページは失敗しても再試行しない。
//   収集：robots 1 ＋ 一覧 最大 3（再試行込み）＋ 詳細 40 ＝ 44 件
//   補完：robots 最大 5 サイト ＋ 詳細 40 ＝ 45 件
const DETAIL_LIMIT_PER_SOURCE = 40; // 残りは翌朝の「商品説明の補完」で取得
const BACKFILL_LIMIT = 40;
const NO_RETRY = { retries: { limit: 0, delay: "1 second" }, timeout: "1 minute" } as const;
const STALE_DAYS = 30; // これより前に発売された商品は取り込まない（自動削除の対象と揃える）

/**
 * コンビニ新商品の収集パイプライン
 *   収集元ごとに: 一覧ページを 1 回取得（条件付きリクエスト）→ 一覧の商品コードが前回と同じなら終了
 *   → 既知の商品を除外 → ルールで整形 →（設定 ON なら）Claude で仕上げ
 *   → 承認待ちに保存（自動公開 ON なら、重複の可能性があるものを除いてそのまま公開）
 */
export class ScrapeWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { DB } = this.env;
    // 同じサイトへ同時にアクセスしないよう、開始を少しずつずらす
    if (event.payload.startAfterMinutes) await step.sleep("stagger", `${event.payload.startAfterMinutes} minutes`);
    if (event.payload.mode === "backfill-details") return this.backfillDetails(step);

    const { settings, sources } = await step.do("load settings and sources", async () => {
      const settings = await getSettings(DB);
      const q = event.payload.sourceId
        ? DB.prepare("SELECT id, name, adapter, url, max_items, list_hash, etag, last_modified FROM scrape_sources WHERE id = ? AND adapter IS NOT NULL").bind(event.payload.sourceId)
        : DB.prepare("SELECT id, name, adapter, url, max_items, list_hash, etag, last_modified FROM scrape_sources WHERE enabled = 1 AND adapter IS NOT NULL");
      return { settings, sources: (await q.all<Source>()).results };
    });
    const useClaude = settings.use_claude && !!this.env.ANTHROPIC_API_KEY;

    // robots.txt はサイトごとに 1 回だけ取得する（ステップの結果は保存されるので、再実行時も取り直さない）
    const robotsCache = new Map<string, RobotsRules>();
    const robots = async (url: string) => {
      const origin = new URL(url).origin;
      if (!robotsCache.has(origin)) robotsCache.set(origin, await step.do(`robots ${origin}`, () => fetchRobots(origin)));
      return robotsCache.get(origin)!;
    };

    for (const [si, src] of sources.entries()) {
      const adapter = ADAPTERS[src.adapter];
      if (!adapter) continue;
      // 0. 一覧を取得し、前回から変わっていなければ何もしない（実行ログも残さない）
      let fetched: { items: RawItem[]; hash: string; etag: string | null; lastModified: string | null } | { unchanged: true } | { error: string };
      try {
        fetched = await step.do(`check ${src.id}`, RETRY, async () => {
          if (!robotsAllows(await robots(src.url), src.url)) throw new Error(`robots.txt で禁止されています: ${src.url}`);
          const force = event.payload.trigger === "manual";
          const page = await politeFetch(src.url, force ? {} : { etag: src.etag, lastModified: src.last_modified });
          if (page.notModified) return { unchanged: true as const };
          const items = adapter.parse(page.body, page.url);
          if (items.length === 0) throw new Error("商品が 0 件でした（ページ構造が変わった可能性があります）");
          const hash = await listHash(items.map((i) => i.externalId));
          if (!force && hash === src.list_hash) return { unchanged: true as const };
          return { items: items.slice(0, Math.min(src.max_items, settings.max_items_per_source)), hash, etag: page.etag, lastModified: page.lastModified };
        });
      } catch (e) {
        fetched = { error: String(e) };
      }
      await step.do(`checked ${src.id}`, () => DB.prepare("UPDATE scrape_sources SET checked_at = datetime('now') WHERE id = ?").bind(src.id).run().then(() => null));
      if ("unchanged" in fetched) continue;

      const runId = await step.do(`start run ${src.id}`, async () => {
        const row = await DB.prepare("INSERT INTO scrape_runs(source_id, instance_id) VALUES (?, ?) RETURNING id").bind(src.id, event.instanceId).first<{ id: number }>();
        return row!.id;
      });
      const totals: Totals = { found: 0, extracted: 0, skipped: 0, errors: 0, input: 0, output: 0 };
      const notes: string[] = [];

      try {
        // 1. 一覧から抽出した商品
        if ("error" in fetched) throw new Error(fetched.error);
        const raw = fetched.items;
        totals.found = raw.length;

        // 2. 既に候補・商品になっているものを除外し、ルールで整形
        let items = await step.do(`normalize ${src.id}`, async () => {
          const keys = raw.map((r) => `${src.adapter}:${r.externalId}`);
          const known = await knownKeys(DB, keys);
          // 同じチェーンで同名の商品（地域違いで商品コードが別など）は 1 件にまとめる
          const { results: sameChain } = await DB.prepare(
            "SELECT name FROM product_candidates WHERE external_key LIKE ? AND status != 'rejected' AND created_at >= datetime('now', '-60 days')",
          )
            .bind(`${src.adapter}:%`)
            .all<{ name: string }>();
          const existingNames = new Set(sameChain.map((r) => normalizeKey(r.name)));
          const today = new Date(Date.now() + 9 * 3600_000); // JST
          const staleBefore = new Date(today.getTime() - STALE_DAYS * 86400_000).toISOString().slice(0, 10);
          const kept = new Map<string, Normalized>();
          for (const r of raw) {
            if (known.has(`${src.adapter}:${r.externalId}`)) continue;
            const n = normalizeByRules(r, today);
            if (n.releasedOn && n.releasedOn < staleBefore) continue; // 1 か月以上前に発売済み
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
              const rules = await robots(n.url);
              const info = await step.do(`detail ${src.id}:${n.externalId}`, NO_RETRY, () => fetchDetail(adapter, n.url, rules));
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

        // 5. 食品だけを承認待ちに保存。自動公開 ON なら重複の可能性があるものを除いてそのまま公開する
        const saved = await step.do(`save ${src.id}`, async () => {
          const products = (await DB.prepare("SELECT id, name FROM products ORDER BY id DESC LIMIT 3000").all<{ id: number; name: string }>()).results;
          const byKey = new Map(products.map((p) => [normalizeKey(p.name), p.id]));
          const firstSeen = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
          const food = items.filter((n) => n.isFood);
          const stmts = food.map((n) =>
            DB.prepare(
              `INSERT INTO product_candidates(source_id, run_id, source_url, name, maker, category_hint, price, kcal, released_on, description, image_url, confidence, duplicate_of, external_key, region, normalized_by)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
            ).bind(
              // 発売日が載っていないサイト（デイリーヤマザキ等）は初回取得日を発売日とみなす
              src.id, runId, n.url, n.name, adapter.label, n.category, n.price, n.kcal, n.releasedOn ?? firstSeen, n.description, n.imageUrl, n.confidence,
              byKey.get(normalizeKey(n.name)) ?? null, `${src.adapter}:${n.externalId}`, n.region, normalizedBy,
            ),
          );
          const ids: number[] = [];
          for (let i = 0; i < stmts.length; i += 50) {
            const res = await DB.batch<{ id: number }>(stmts.slice(i, i + 50));
            res.forEach((r) => ids.push(r.results[0].id));
          }
          return { ids, saved: food.length, nonFood: items.filter((n) => !n.isFood).map((n) => n.name) };
        });
        totals.extracted = saved.saved;
        totals.skipped += saved.nonFood.length;
        if (saved.nonFood.length) notes.push(`食品以外として除外: ${saved.nonFood.slice(0, 5).join("、")}${saved.nonFood.length > 5 ? " ほか" : ""}`);
        if (!useClaude && settings.use_claude) notes.push("Claude 整形が ON ですが ANTHROPIC_API_KEY が未設定のためルール整形のみ実行");

        if (settings.auto_publish && saved.ids.length) {
          const r = await step.do(`publish ${src.id}`, () => autoPublish(DB, saved.ids, adapter.label));
          notes.push(`自動公開 ${r.published}件${r.duplicates ? `・重複の可能性で除外 ${r.duplicates}件` : ""}`);
        }

        // 次回の更新検知用に、今回処理した一覧を記録
        if (!("error" in fetched)) {
          const f = fetched;
          await step.do(`remember ${src.id}`, () =>
            DB.prepare("UPDATE scrape_sources SET list_hash = ?, etag = ?, last_modified = ?, changed_at = datetime('now') WHERE id = ?")
              .bind(f.hash, f.etag, f.lastModified, src.id)
              .run()
              .then(() => null),
          );
        }
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
    const robotsCache = new Map<string, RobotsRules>();
    const robots = async (url: string) => {
      const origin = new URL(url).origin;
      if (!robotsCache.has(origin)) robotsCache.set(origin, await step.do(`robots ${origin}`, () => fetchRobots(origin)));
      return robotsCache.get(origin)!;
    };
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
        const rules = await robots(t.source_url);
        await step.do(`backfill ${t.id}`, NO_RETRY, async () => {
          const info = await fetchDetail(ADAPTERS[t.adapter!], t.source_url, rules);
          await DB.prepare("UPDATE products SET description = COALESCE(description, ?), kcal = COALESCE(kcal, ?), detail_fetched_at = datetime('now') WHERE id = ?")
            .bind(info.description, parseKcal(info.kcalText), t.id)
            .run();
        });
        ok++;
      } catch {
        failed++;
        // 取得できないページを毎日取りに行かないよう、試したことだけ記録する
        await step.do(`backfill mark ${t.id}`, () => DB.prepare("UPDATE products SET detail_fetched_at = datetime('now') WHERE id = ?").bind(t.id).run().then(() => null));
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

async function fetchDetail(adapter: (typeof ADAPTERS)[AdapterName], url: string, rules: RobotsRules) {
  if (!robotsAllows(rules, url)) return { description: null, kcalText: null };
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
