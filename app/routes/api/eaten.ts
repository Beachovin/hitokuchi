import { data } from "react-router";
import type { Route } from "./+types/eaten";
import { getUser } from "~/lib/auth.server";
import { setEaten } from "~/lib/engage.server";

// 「食べた」の記録・解除（ログイン必須）
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await getUser(request, env);
  if (!user) return data({ ok: false as const }, { status: 401 });
  const form = await request.formData();
  const productId = Number(form.get("productId"));
  if (!Number.isInteger(productId)) return data({ ok: false as const }, { status: 400 });
  await setEaten(env.DB, user.id, productId, form.get("on") === "1");
  return { ok: true as const };
}
export const loader = () => new Response("Not found", { status: 404 });
