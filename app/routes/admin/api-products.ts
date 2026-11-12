import type { Route } from "./+types/api-products";
import { requireAdmin } from "~/lib/admin.server";
import { listProducts } from "~/lib/db.server";

// 特集エディタ用の商品検索（JSON）
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const rows = await listProducts(env.DB, { q, sort: "new", limit: 20 });
  return Response.json(rows.map((p) => ({ id: p.id, name: p.name, maker: p.maker, image_url: p.image_url, released_on: p.released_on, category_emoji: p.category_emoji })));
}
