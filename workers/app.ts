import { createRequestHandler } from "react-router";
export { ScrapeWorkflow } from "./scrape-workflow";
import { generateNotifications } from "../app/lib/engage.server";
import { sendWeeklyDigests } from "../app/lib/digest.server";
import { getSettings } from "../app/lib/settings.server";
import { addDays, mondayOf, todayJst } from "../app/lib/weeks";
import { generateWeeklyBattles } from "../app/lib/battles.server";
import { purgeOldProducts } from "../app/lib/retention.server";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // R2 に置いた画像を配信（/img/<key>）
    if (url.pathname.startsWith("/img/")) {
      const obj = await env.IMAGES.get(decodeURIComponent(url.pathname.slice(5)));
      if (!obj) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      return new Response(obj.body, { headers });
    }
    const res = await requestHandler(request, { cloudflare: { env, ctx } });
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      // 管理画面は検索エンジンに載せない・キャッシュしない・他サイトに埋め込ませない
      const h = new Headers(res.headers);
      h.set("X-Robots-Tag", "noindex, nofollow");
      h.set("Cache-Control", "private, no-store");
      h.set("X-Frame-Options", "DENY");
      h.set("Referrer-Policy", "same-origin");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }
    return res;
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "0 23 * * SUN") {
      // 月曜 8:00 JST：週1回のダイジェスト（設定で有効なときだけ）
      ctx.waitUntil(
        (async () => {
          const s = await getSettings(env.DB);
          if (s.digest_enabled && env.SITE_ORIGIN) await sendWeeklyDigests(env, env.SITE_ORIGIN);
        })(),
      );
      return;
    }
    // 毎朝 6:00 JST：各コンビニの新商品一覧の更新確認（変化があれば取り込み）・気になる商品の通知・今週のバトル作成
    ctx.waitUntil(env.SCRAPE_WORKFLOW.create({ params: { trigger: "cron" } }).then(() => {}));
    ctx.waitUntil(generateNotifications(env.DB, todayJst()).then(() => {}));
    // 今週の新商品バトル（ジャンルごと・まだ無いジャンルだけ追加）
    const week = mondayOf(todayJst());
    ctx.waitUntil(generateWeeklyBattles(env.DB, week, addDays(week, 6)).then(() => {}));
    // 発売から 1 か月を過ぎた商品（と口コミ等）を削除
    ctx.waitUntil(purgeOldProducts(env).then((r) => console.log("purge", r)).catch((e) => console.error("purge failed", e)));
  },
} satisfies ExportedHandler<Env>;
