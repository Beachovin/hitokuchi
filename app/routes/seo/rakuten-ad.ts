import type { Route } from "./+types/rakuten-ad";
import { getSettings } from "~/lib/settings.server";
import { rakutenAdDocument } from "~/lib/rakuten-ad";

/**
 * 楽天の画像広告だけを表示する小さなページ（広告枠の iframe から読み込む）。
 * 楽天のウィジェットは、埋め込まれたページの URL を手がかりに商品を選ぶため、
 * インラインの iframe（about:srcdoc）ではなく、サイト上の実際の URL で配信する。
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const s = await getSettings(context.cloudflare.env.DB);
  const code = params.slot === "pc" ? s.rakuten_ad_pc || s.rakuten_ad_sp : s.rakuten_ad_sp || s.rakuten_ad_pc;
  if (!s.rakuten_ads_enabled || !code) return new Response("Not found", { status: 404 });
  return new Response(rakutenAdDocument(code), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
      // このページを埋め込めるのは自サイトだけ
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
