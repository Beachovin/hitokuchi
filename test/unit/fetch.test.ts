import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedByRobots, listHash, politeFetch } from "../../workers/scrape/fetch";

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (handler: (url: string, init?: RequestInit) => Response) => {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input instanceof Request ? input.url : input), init));
  vi.stubGlobal("fetch", spy);
  return spy;
};

describe("一覧の更新検知（ハッシュ）", () => {
  it("並び順や重複が変わっても同じ値になる", async () => {
    expect(await listHash(["b", "a", "c"])).toBe(await listHash(["c", "a", "b", "a"]));
  });
  it("商品が増減したら値が変わる", async () => {
    expect(await listHash(["a", "b"])).not.toBe(await listHash(["a", "b", "c"]));
    expect(await listHash(["a", "b"])).not.toBe(await listHash(["a"]));
  });
});

describe("取得（politeFetch）", () => {
  it("ETag を返し、次回は条件付きリクエストで送る", async () => {
    const spy = stubFetch((_u, init) => {
      const h = new Headers(init?.headers);
      return h.get("if-none-match") === '"v1"' ? new Response(null, { status: 304 }) : new Response("<html>一覧</html>", { headers: { "content-type": "text/html", etag: '"v1"' } });
    });
    const first = await politeFetch("https://shop.example.test/new");
    expect(first).toMatchObject({ notModified: false, etag: '"v1"', body: "<html>一覧</html>" });
    const second = await politeFetch("https://shop.example.test/new", { etag: first.etag });
    expect(second.notModified).toBe(true);
    expect(new Headers(spy.mock.calls[0][1]?.headers).get("user-agent")).toContain("HitokuchiBot");
  });
  it("エラー応答・HTML 以外は例外にする", async () => {
    stubFetch(() => new Response("ng", { status: 503 }));
    await expect(politeFetch("https://shop.example.test/new")).rejects.toThrow("HTTP 503");
    stubFetch(() => new Response("bin", { headers: { "content-type": "application/pdf" } }));
    await expect(politeFetch("https://shop.example.test/new")).rejects.toThrow("unsupported");
  });
  it("meta refresh のリダイレクトを 1 回だけ追う", async () => {
    const spy = stubFetch((u) =>
      u.endsWith("/old")
        ? new Response(`<meta http-equiv="refresh" content="0; url=/new">`, { headers: { "content-type": "text/html" } })
        : new Response("<html>新しい一覧</html>", { headers: { "content-type": "text/html" } }),
    );
    expect((await politeFetch("https://shop.example.test/old")).body).toContain("新しい一覧");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("robots.txt の確認", () => {
  const robots = (body: string) => stubFetch(() => new Response(body, { headers: { "content-type": "text/plain" } }));
  it("Disallow されたパスは取得しない", async () => {
    robots("User-agent: *\nDisallow: /private/\n");
    expect(await isAllowedByRobots("https://shop.example.test/private/list")).toBe(false);
    expect(await isAllowedByRobots("https://shop.example.test/new/")).toBe(true);
  });
  it("より長い Allow が優先される", async () => {
    robots("User-agent: *\nDisallow: /goods/\nAllow: /goods/new/\n");
    expect(await isAllowedByRobots("https://shop.example.test/goods/new/list.html")).toBe(true);
    expect(await isAllowedByRobots("https://shop.example.test/goods/old.html")).toBe(false);
  });
  it("他のボット向けの指定は無視する", async () => {
    robots("User-agent: BadBot\nDisallow: /\n");
    expect(await isAllowedByRobots("https://shop.example.test/new/")).toBe(true);
  });
  it("robots.txt が無い・取得できないときは許可とみなす", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    expect(await isAllowedByRobots("https://shop.example.test/new/")).toBe(true);
  });
});
