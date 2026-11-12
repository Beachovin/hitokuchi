import type { Route } from "./+types/rakuten-ad";
import { getSettings } from "~/lib/settings.server";
import { getUser } from "~/lib/auth.server";
import { isAdmin } from "~/lib/admin.server";
import { RAKUTEN_AD_CSP, rakutenAdDocument } from "~/lib/rakuten-ad";

/**
 * 楽天の画像広告だけを表示する小さなページ（広告枠の iframe から読み込む）。
 * 楽天のウィジェットは中でさらに楽天の iframe を作り、ページの URL も使うため、
 * インラインの iframe ではなく、サイト上の実際の URL で配信する。
 * 読み込めるのは楽天のドメインだけ（Content-Security-Policy で制限）。
 * 広告がオフのときは、管理者のプレビュー以外では表示しない。
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const s = await getSettings(env.DB);
  const code = params.slot === "pc" ? s.rakuten_ad_pc || s.rakuten_ad_sp : s.rakuten_ad_sp || s.rakuten_ad_pc;
  if (!code) return new Response("Not found", { status: 404 });
  if (!s.rakuten_ads_enabled) {
    const user = await getUser(request, env);
    if (!user || !(await isAdmin(env, user))) return new Response("Not found", { status: 404 });
  }
  return new Response(rakutenAdDocument(code), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": s.rakuten_ads_enabled ? "public, max-age=300" : "private, no-store",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": RAKUTEN_AD_CSP,
    },
  });
}
