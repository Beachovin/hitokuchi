import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { audit, isAdmin, requireAdmin } from "~/lib/admin.server";
import { createSession, destroySession, getUser, upsertGoogleUser } from "~/lib/auth.server";
import { addUser, count } from "../helpers";

const ORIGIN = "https://hitokuchi.example.test";
const login = async (userId: string) => (await createSession(new Request(ORIGIN), env, userId)).split(";")[0];
const req = (path: string, cookie?: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(ORIGIN + path, { ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });

/** requireAdmin が投げた Response（リダイレクトや 403）を受け取る */
const rejected = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  throw new Error("拒否されるはずが通ってしまった");
};

describe("ログインセッション", () => {
  it("Cookie にはトークンだけを入れ、DB にはハッシュだけを保存する", async () => {
    const user = await addUser();
    const setCookie = await createSession(new Request(ORIGIN), env, user);
    expect(setCookie).toMatch(/^hk_session=[^;]+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax; Secure$/);
    const token = decodeURIComponent(setCookie.split(";")[0].split("=")[1]);
    expect(await count("SELECT COUNT(*) n FROM sessions WHERE id = ?", token)).toBe(0);
    expect(await count("SELECT COUNT(*) n FROM sessions WHERE user_id = ?", user)).toBe(1);
  });
  it("ログイン中のユーザーを取得でき、ログアウトすると無効になる", async () => {
    const user = await addUser();
    const cookie = await login(user);
    expect((await getUser(req("/", cookie), env))?.id).toBe(user);
    await destroySession(req("/", cookie), env);
    expect(await getUser(req("/", cookie), env)).toBeNull();
  });
  it("でたらめな Cookie・期限切れのセッションではログイン扱いにならない", async () => {
    const user = await addUser();
    const cookie = await login(user);
    expect(await getUser(req("/", "hk_session=forged-token"), env)).toBeNull();
    await env.DB.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 minute') WHERE user_id = ?").bind(user).run();
    expect(await getUser(req("/", cookie), env)).toBeNull();
  });
  it("同じ Google アカウントは 2 回目以降も同じユーザーになる", async () => {
    const first = await upsertGoogleUser(env, { sub: "g-123", email: "a@example.test", name: "A", picture: null });
    const again = await upsertGoogleUser(env, { sub: "g-123", email: "a-new@example.test", name: "A", picture: null });
    expect(again.id).toBe(first.id);
    expect(await count("SELECT COUNT(*) n FROM users WHERE google_sub = 'g-123' AND email = 'a-new@example.test'")).toBe(1);
  });
});

describe("管理画面の保護", () => {
  it("未ログインならログイン画面へ送る", async () => {
    const res = await rejected(requireAdmin(req("/admin/users"), env));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login?returnTo=%2Fadmin%2Fusers");
  });
  it("一般ユーザーは表示も操作もできない", async () => {
    const cookie = await login(await addUser());
    const view = await rejected(requireAdmin(req("/admin", cookie), env));
    expect(view.headers.get("Location")).toContain("reason=forbidden");
    const write = await rejected(requireAdmin(req("/admin/settings", cookie, { method: "POST" }), env));
    expect(write.status).toBe(403);
  });
  it("管理者は入れる", async () => {
    const id = await addUser({ role: "admin", email: "staff@example.test" });
    expect(await requireAdmin(req("/admin", await login(id)), env)).toMatchObject({ id, email: "staff@example.test" });
  });
  it("ADMIN_EMAILS に載っているメールは初回に自動で管理者になる（大文字小文字は区別しない）", async () => {
    const id = await addUser({ email: "OWNER@example.test" });
    expect(await isAdmin(env, { id, email: "OWNER@example.test", role: "user" })).toBe(true);
    expect(await count("SELECT COUNT(*) n FROM users WHERE id = ? AND role = 'admin'", id)).toBe(1);
    expect(await isAdmin(env, { id: "x", email: "someone@example.test", role: "user" })).toBe(false);
  });
  it("ログインから 12 時間を過ぎた管理者は再ログインを求められる", async () => {
    const id = await addUser({ role: "admin" });
    const cookie = await login(id);
    await env.DB.prepare("UPDATE sessions SET created_at = datetime('now', '-13 hours') WHERE user_id = ?").bind(id).run();
    expect((await rejected(requireAdmin(req("/admin", cookie), env))).headers.get("Location")).toContain("reason=expired");
  });
  it("別サイトから送られた変更リクエストは拒否する", async () => {
    const cookie = await login(await addUser({ role: "admin" }));
    const res = await rejected(requireAdmin(req("/admin/settings", cookie, { method: "POST", headers: { Origin: "https://evil.example" } }), env));
    expect(res.status).toBe(403);
    expect(await requireAdmin(req("/admin/settings", cookie, { method: "POST", headers: { Origin: ORIGIN } }), env)).toHaveProperty("id");
  });
  it("ADMIN_HOST を設定すると、ほかのドメインの /admin は 404 になる", async () => {
    const cookie = await login(await addUser({ role: "admin" }));
    const res = await rejected(requireAdmin(req("/admin", cookie), { ...env, ADMIN_HOST: "admin.example.test" } as unknown as Env));
    expect(res.status).toBe(404);
  });
  it("Cloudflare Access 必須のときは、Access の認証メールとログイン中のメールの一致を確認する", async () => {
    const id = await addUser({ role: "admin", email: "staff2@example.test" });
    const cookie = await login(id);
    const strict = { ...env, ADMIN_REQUIRE_ACCESS: "true" } as unknown as Env;
    expect((await rejected(requireAdmin(req("/admin", cookie), strict))).status).toBe(403);
    expect((await rejected(requireAdmin(req("/admin", cookie, { headers: { "Cf-Access-Authenticated-User-Email": "other@example.test" } }), strict))).status).toBe(403);
    expect(await requireAdmin(req("/admin", cookie, { headers: { "Cf-Access-Authenticated-User-Email": "Staff2@example.test" } }), strict)).toHaveProperty("id", id);
  });
  it("管理操作は監査ログに残る", async () => {
    const id = await addUser({ role: "admin", email: "auditor@example.test" });
    await audit(env, req("/admin/settings", undefined, { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.9" } }), { id, email: "auditor@example.test", nickname: null }, "settings.update", "setting:x", { a: 1 });
    expect(await env.DB.prepare("SELECT action, target, ip FROM admin_audit_logs WHERE email = 'auditor@example.test'").first()).toEqual({ action: "settings.update", target: "setting:x", ip: "203.0.113.9" });
  });
});
