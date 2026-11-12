// 全レスポンスに付けるセキュリティヘッダーと、他サイトからの書き込みリクエスト（CSRF）の拒否

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * 他サイトから送られた書き込みリクエストなら true。
 * Origin が自サイトと違う、または（Origin が無いとき）ブラウザが cross-site と申告しているものを拒否する。
 */
export function isCrossSiteWrite(request: Request) {
  if (!WRITE_METHODS.has(request.method)) return false;
  const origin = request.headers.get("Origin");
  if (origin) return origin !== new URL(request.url).origin;
  return request.headers.get("Sec-Fetch-Site") === "cross-site";
}

export const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/** ページ・API のレスポンスに共通のセキュリティヘッダーを付ける */
export function withSecurityHeaders(res: Response, url: URL) {
  const h = new Headers(res.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (url.protocol === "https:") h.set("Strict-Transport-Security", "max-age=31536000");
  if (isAdminPath(url.pathname)) {
    // 管理画面は検索エンジンに載せない・キャッシュしない・他サイトに埋め込ませない
    h.set("X-Robots-Tag", "noindex, nofollow");
    h.set("Cache-Control", "private, no-store");
    h.set("X-Frame-Options", "DENY");
    h.set("Referrer-Policy", "same-origin");
  } else {
    h.set("X-Frame-Options", "SAMEORIGIN");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** R2 の画像を返すときのヘッダー。万一画像以外が紛れてもスクリプトとして動かないようにする */
export function imageHeaders(base: Headers) {
  const h = new Headers(base);
  if (!/^image\/(jpeg|png|webp|gif)$/.test(h.get("content-type") ?? "")) h.set("content-type", "application/octet-stream");
  h.set("cache-control", "public, max-age=31536000, immutable");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Content-Security-Policy", "default-src 'none'; sandbox");
  h.set("Cross-Origin-Resource-Policy", "same-site");
  return h;
}
