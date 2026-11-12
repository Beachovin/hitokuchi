import { getUser, type User } from "./auth.server";

/**
 * 管理画面の認可（多層防御）
 *  1. 管理用ドメインの制限（ADMIN_HOST 設定時：それ以外のドメインの /admin は 404）
 *  2. Google ログイン済みであること
 *  3. role = 'admin'（ADMIN_EMAILS のアドレスは初回ログイン時に自動で管理者に昇格）
 *  4. ログインから ADMIN_SESSION_HOURS 時間以内（古いセッションでは再ログインを要求）
 *  5. Cloudflare Access のメールと一致（ADMIN_REQUIRE_ACCESS="true" のとき）
 *  6. 変更系リクエストは自サイトからの送信であること（CSRF 対策）
 */
export type Admin = { id: string; email: string; nickname: string | null };

const emails = (env: Env) => env.ADMIN_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function adminHostAllowed(request: Request, env: Env) {
  return !env.ADMIN_HOST || new URL(request.url).hostname === env.ADMIN_HOST;
}

export async function requireAdmin(request: Request, env: Env): Promise<Admin> {
  const url = new URL(request.url);
  if (!adminHostAllowed(request, env)) throw new Response("Not found", { status: 404 });

  const loginUrl = (reason?: string) =>
    `/admin/login?returnTo=${encodeURIComponent(url.pathname + url.search)}${reason ? `&reason=${reason}` : ""}`;

  const user = await getUser(request, env);
  if (!user) throw redirect(loginUrl());

  if (!(await isAdmin(env, user))) {
    // 画面表示はログイン画面へ（「権限がありません」を案内）、変更系は 403
    if (request.method === "GET") throw redirect(loginUrl("forbidden"));
    throw new Response("この操作には管理者権限が必要です", { status: 403 });
  }

  // 管理操作は「最近ログインしたセッション」に限る
  const hours = Number(env.ADMIN_SESSION_HOURS) || 12;
  const age = Date.now() - new Date(user.session_created_at.replace(" ", "T") + "Z").getTime();
  if (age > hours * 3600_000) throw redirect(loginUrl("expired"));

  if (String(env.ADMIN_REQUIRE_ACCESS) === "true") {
    const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email")?.toLowerCase();
    if (!accessEmail || accessEmail !== user.email.toLowerCase()) throw new Response("Cloudflare Access の認証が必要です", { status: 403 });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) throw new Response("不正なリクエストです", { status: 403 });
  }

  return { id: user.id, email: user.email, nickname: user.nickname };
}

/** role が admin、または ADMIN_EMAILS に含まれる（その場合は role を admin に更新） */
export async function isAdmin(env: Env, user: Pick<User, "id" | "email" | "role">) {
  if (user.role === "admin") return true;
  if (emails(env).includes(user.email.toLowerCase())) {
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
    return true;
  }
  return false;
}

/** 管理操作の記録 */
export async function audit(env: Env, request: Request, admin: Admin, action: string, target?: string | number | null, detail?: unknown) {
  await env.DB.prepare("INSERT INTO admin_audit_logs(user_id, email, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(
      admin.id,
      admin.email,
      action,
      target == null ? null : String(target),
      detail == null ? null : typeof detail === "string" ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500),
      request.headers.get("CF-Connecting-IP"),
    )
    .run();
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}
