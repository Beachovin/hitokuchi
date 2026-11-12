// Google ログイン（OAuth 2.0 / OpenID Connect + PKCE）とセッション管理

const SESSION_COOKIE = "hk_session";
const OAUTH_COOKIE = "hk_oauth";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  google_name: string | null;
  avatar_url: string | null;
  nickname: string | null;
  avatar_key: string | null;
  age_group: string | null;
  gender: string | null;
  show_age: number;
  show_gender: number;
  digest_opt_in: number;
  role: "user" | "admin";
  session_created_at: string;
};

// ---------- 小さなユーティリティ ----------
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256(s: string) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

function readCookie(request: Request, name: string) {
  const m = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function cookie(request: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** ログイン後の戻り先。オープンリダイレクトを防ぐため自サイト内の相対パスだけ許可 */
export function safeReturnTo(v: string | null | undefined) {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.startsWith("/auth/")) return "/";
  return v;
}

export const googleConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// ---------- セッション ----------
export async function getUser(request: Request, env: Env): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.google_name, u.avatar_url, u.nickname, u.avatar_key, u.age_group, u.gender, u.show_age, u.show_gender, u.digest_opt_in, u.role, s.created_at AS session_created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now') AND u.suspended_at IS NULL`,
  )
    .bind(await sha256(token))
    .first<User>();
}

/** ログイン必須の操作用。未ログインならログイン画面へ（戻り先付き） */
export async function requireUser(request: Request, env: Env, returnTo?: string) {
  const user = await getUser(request, env);
  if (!user) {
    const back = safeReturnTo(returnTo ?? new URL(request.url).pathname + new URL(request.url).search);
    throw new Response(null, { status: 302, headers: { Location: `/login?returnTo=${encodeURIComponent(back)}` } });
  }
  return user;
}

export async function createSession(request: Request, env: Env, userId: string) {
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now')").bind(userId),
    env.DB.prepare(`INSERT INTO sessions(id, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).bind(await sha256(token), userId),
    env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(userId),
  ]);
  return cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86400);
}

export async function destroySession(request: Request, env: Env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
  return cookie(request, SESSION_COOKIE, "", 0);
}

// ---------- Google OAuth ----------
const redirectUri = (request: Request) => `${new URL(request.url).origin}/auth/google/callback`;

/** Google の同意画面へ。state と PKCE の verifier は短命の Cookie に保存 */
export async function startGoogleLogin(request: Request, env: Env, returnTo: string) {
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Set-Cookie": cookie(request, OAUTH_COOKIE, JSON.stringify({ state, verifier, returnTo }), 600) },
  });
}

type IdTokenClaims = { iss: string; aud: string; sub: string; exp: number; email?: string; email_verified?: boolean; name?: string; picture?: string };

/** コールバック：state を照合し、コードを ID トークンに交換してユーザーを作成・更新 */
export async function finishGoogleLogin(request: Request, env: Env) {
  const url = new URL(request.url);
  const saved = (() => {
    try {
      return JSON.parse(readCookie(request, OAUTH_COOKIE) ?? "") as { state: string; verifier: string; returnTo: string };
    } catch {
      return null;
    }
  })();
  const clearOauth = cookie(request, OAUTH_COOKIE, "", 0);
  const fail = (reason: string) =>
    new Response(null, { status: 302, headers: [["Location", `/login?error=${encodeURIComponent(reason)}`], ["Set-Cookie", clearOauth]] });

  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return fail("state");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  if (!res.ok) return fail("token");
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return fail("token");

  // ID トークンは TLS で Google のトークンエンドポイントから直接受け取っているため、署名検証は省略しクレームを検証する
  let claims: IdTokenClaims;
  try {
    const payload = id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))));
  } catch {
    return fail("token");
  }
  const validIss = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!validIss || claims.aud !== env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || !claims.email || claims.email_verified === false) {
    return fail("claims");
  }

  const user = await upsertGoogleUser(env, { sub: claims.sub, email: claims.email, name: claims.name ?? null, picture: claims.picture ?? null });
  if (await isSuspended(env, user.id)) return fail("suspended");
  const sessionCookie = await createSession(request, env, user.id);
  const dest = user.nickname ? safeReturnTo(saved.returnTo) : `/mypage?setup=1&returnTo=${encodeURIComponent(safeReturnTo(saved.returnTo))}`;
  return new Response(null, { status: 302, headers: [["Location", dest], ["Set-Cookie", clearOauth], ["Set-Cookie", sessionCookie]] });
}

export async function upsertGoogleUser(env: Env, g: { sub: string; email: string; name: string | null; picture: string | null }) {
  const id = crypto.randomUUID();
  return (await env.DB.prepare(
    `INSERT INTO users(id, google_sub, email, google_name, avatar_url) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, google_name = excluded.google_name, avatar_url = excluded.avatar_url
     RETURNING id, nickname`,
  )
    .bind(id, g.sub, g.email, g.name, g.picture)
    .first<{ id: string; nickname: string | null }>())!;
}

export async function isSuspended(env: Env, userId: string) {
  return !!(await env.DB.prepare("SELECT 1 FROM users WHERE id = ? AND suspended_at IS NOT NULL").bind(userId).first());
}

// ---------- ニックネーム ----------
export function validateNickname(raw: string) {
  const n = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 16) return { error: "ニックネームは2〜16文字で入力してください" };
  if (/[<>"'`\\]/.test(n) || /https?:|@/.test(n)) return { error: "使用できない文字が含まれています" };
  if (/運営|公式|管理者|admin/i.test(n) || n === "ひとくち") return { error: "このニックネームは使用できません" };
  return { nickname: n };
}
