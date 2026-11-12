import { describe, expect, it } from "vitest";
import { imageHeaders, isAdminPath, isCrossSiteWrite, withSecurityHeaders } from "../../workers/security";
import { sniffImage } from "../../app/lib/image";
import { fakeImage } from "../helpers";

const req = (method: string, headers: Record<string, string> = {}) => new Request("https://hitokuchi.example.test/products/1", { method, headers });

describe("他サイトからの書き込みリクエストの拒否（CSRF 対策）", () => {
  it("読み取り（GET）は対象外", () => expect(isCrossSiteWrite(req("GET", { Origin: "https://evil.example" }))).toBe(false));
  it("同じサイトからの POST は通す", () => expect(isCrossSiteWrite(req("POST", { Origin: "https://hitokuchi.example.test" }))).toBe(false));
  it("別サイトからの POST は拒否する", () => {
    expect(isCrossSiteWrite(req("POST", { Origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { Origin: "null" }))).toBe(true);
  });
  it("Origin が無くてもブラウザが cross-site と申告していれば拒否する", () => {
    expect(isCrossSiteWrite(req("POST", { "Sec-Fetch-Site": "cross-site" }))).toBe(true);
    expect(isCrossSiteWrite(req("POST", { "Sec-Fetch-Site": "same-origin" }))).toBe(false);
    expect(isCrossSiteWrite(req("POST"))).toBe(false); // curl など
  });
});

describe("セキュリティヘッダー", () => {
  it("お客様向けページ", () => {
    const h = withSecurityHeaders(new Response("ok"), new URL("https://hitokuchi.example.test/products")).headers;
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(h.get("Strict-Transport-Security")).toContain("max-age=");
    expect(h.get("X-Robots-Tag")).toBeNull();
  });
  it("管理画面は検索に載せず、キャッシュさせず、埋め込みも禁止する", () => {
    const h = withSecurityHeaders(new Response("ok"), new URL("https://hitokuchi.example.test/admin/users")).headers;
    expect(h.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(h.get("Cache-Control")).toBe("private, no-store");
    expect(h.get("X-Frame-Options")).toBe("DENY");
  });
  it("/admin で始まるだけの別ページは管理画面扱いしない", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/login")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
  });
  it("ローカル（http）では HSTS を付けない", () => {
    expect(withSecurityHeaders(new Response("ok"), new URL("http://localhost:5173/")).headers.get("Strict-Transport-Security")).toBeNull();
  });
  it("ステータスと本文はそのまま返す", async () => {
    const res = withSecurityHeaders(new Response("ng", { status: 404 }), new URL("https://hitokuchi.example.test/x"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("ng");
  });
});

describe("画像の配信ヘッダー", () => {
  it("画像は長期キャッシュし、スクリプトとして動かないようにする", () => {
    const h = imageHeaders(new Headers({ "content-type": "image/webp" }));
    expect(h.get("content-type")).toBe("image/webp");
    expect(h.get("cache-control")).toContain("immutable");
    expect(h.get("Content-Security-Policy")).toContain("sandbox");
  });
  it("画像以外（SVG・HTML など）が紛れていたらダウンロード扱いにする", () => {
    expect(imageHeaders(new Headers({ "content-type": "image/svg+xml" })).get("content-type")).toBe("application/octet-stream");
    expect(imageHeaders(new Headers({ "content-type": "text/html" })).get("content-type")).toBe("application/octet-stream");
    expect(imageHeaders(new Headers()).get("content-type")).toBe("application/octet-stream");
  });
});

describe("画像形式の判定（中身で確認）", () => {
  it("JPEG・PNG・WebP・GIF を判定する", () => {
    expect(sniffImage(fakeImage("jpeg"))).toBe("image/jpeg");
    expect(sniffImage(fakeImage("png"))).toBe("image/png");
    expect(sniffImage(fakeImage("webp"))).toBe("image/webp");
    expect(sniffImage(fakeImage("gif"))).toBe("image/gif");
  });
  it("SVG・HTML・空のファイルは画像として認めない", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImage(enc(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))).toBeNull();
    expect(sniffImage(enc("<!doctype html><html><body>hello world</body></html>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
