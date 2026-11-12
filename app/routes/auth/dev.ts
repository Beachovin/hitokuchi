import type { Route } from "./+types/dev";
import { createSession, isSuspended, safeReturnTo, upsertGoogleUser } from "~/lib/auth.server";

// ローカル開発専用：Google の認証情報が無くてもログイン後の動作を確認できるようにする
// localhost かつ ADMIN_DEV_BYPASS="true" のときだけ有効（本番では 404）
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const host = new URL(request.url).hostname;
  if (env.ADMIN_DEV_BYPASS !== "true" || !["localhost", "127.0.0.1"].includes(host)) return new Response("Not found", { status: 404 });
  const form = await request.formData();
  const label = String(form.get("label") || "dev").replace(/[^\w-]/g, "").slice(0, 20) || "dev";
  const user = await upsertGoogleUser(env, { sub: `dev-${label}`, email: `${label}@example.test`, name: `開発用 ${label}`, picture: null });
  if (await isSuspended(env, user.id)) return new Response(null, { status: 302, headers: { Location: "/login?error=suspended" } });
  if (form.get("admin") === "1") {
    // 開発用の管理者（localhost かつ ADMIN_DEV_BYPASS のときだけ到達する）
    await env.DB.prepare("UPDATE users SET role = 'admin', nickname = COALESCE(nickname, ?) WHERE id = ?").bind(`管理者${label}`.slice(0, 16), user.id).run();
    user.nickname = user.nickname ?? "admin";
  }
  const returnTo = safeReturnTo(String(form.get("returnTo") ?? "/"));
  const dest = user.nickname ? returnTo : `/mypage?setup=1&returnTo=${encodeURIComponent(returnTo)}`;
  return new Response(null, { status: 302, headers: { Location: dest, "Set-Cookie": await createSession(request, env, user.id) } });
}

export const loader = () => new Response("Not found", { status: 404 });
