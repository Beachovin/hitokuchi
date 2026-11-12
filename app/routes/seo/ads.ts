import type { Route } from "./+types/ads";
import { getSettings } from "~/lib/settings.server";

// AdSense の ads.txt（クライアント ID が設定されているときだけ配信）
export async function loader({ context }: Route.LoaderArgs) {
  const s = await getSettings(context.cloudflare.env.DB);
  const pub = s.adsense_client.replace(/^ca-/, "");
  if (!/^pub-\d+$/.test(pub)) return new Response("Not found", { status: 404 });
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
