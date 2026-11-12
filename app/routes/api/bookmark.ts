import { data } from "react-router";
import type { Route } from "./+types/bookmark";
import { getUser } from "~/lib/auth.server";
import { toggleBookmark } from "~/lib/db.server";
import { notifyNewAchievements } from "~/lib/achievements.server";

// 「気になる」の追加・解除（ログイン必須）
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await getUser(request, env);
  if (!user) return data({ ok: false as const, error: "login" }, { status: 401 });
  const form = await request.formData();
  const productId = Number(form.get("productId"));
  if (!Number.isInteger(productId)) return data({ ok: false as const, error: "bad request" }, { status: 400 });
  const on = form.get("on") === "1";
  await toggleBookmark(env.DB, user.id, productId, on);
  if (on) await notifyNewAchievements(env.DB, user.id);
  return { ok: true as const, productId, on };
}

export const loader = () => new Response("Not found", { status: 404 });
