import { createRequestHandler } from "react-router";
export { ScrapeWorkflow } from "./scrape-workflow";
import { generateNotifications } from "../app/lib/engage.server";
import { sendWeeklyDigests } from "../app/lib/digest.server";
import { getSettings } from "../app/lib/settings.server";
import { addDays, mondayOf, todayJst } from "../app/lib/weeks";
import { generateWeeklyBattles } from "../app/lib/battles.server";
import { runMaintenance } from "../app/lib/retention.server";
import { imageHeaders, isCrossSiteWrite, withSecurityHeaders } from "./security";

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
      return new Response(obj.body, { headers: imageHeaders(headers) });
    }
    if (isCrossSiteWrite(request)) return new Response("不正なリクエストです", { status: 403 });
    const res = await requestHandler(request, { cloudflare: { env, ctx } });
    return withSecurityHeaders(res, url);
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
    // 後片付け：発売から 1 か月を過ぎた商品・使われていない画像・期限切れのセッションなどを削除
    ctx.waitUntil(runMaintenance(env).then((r) => console.log("maintenance", JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
