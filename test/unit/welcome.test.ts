import { describe, expect, it } from "vitest";
import { WELCOME_STEPS, welcomeMode } from "~/lib/welcome";

const base = { pathname: "/", seen: false, loggedIn: false, bot: false };

describe("ようこそガイドの出し方", () => {
  it("トップに初めて来た人には、全体の説明を出す", () => expect(welcomeMode(base)).toBe("modal"));
  it("商品ページなどに直接来た人には、読みたいページを隠さない小さな案内を出す", () => {
    expect(welcomeMode({ ...base, pathname: "/products/12" })).toBe("banner");
    expect(welcomeMode({ ...base, pathname: "/weekly/2026-11-09" })).toBe("banner");
  });
  it("一度閉じた人・ログイン中の人・ボットには出さない", () => {
    expect(welcomeMode({ ...base, seen: true })).toBeNull();
    expect(welcomeMode({ ...base, loggedIn: true })).toBeNull();
    expect(welcomeMode({ ...base, bot: true })).toBeNull();
  });
  it("説明ページ・ログインなど手続きの途中では出さない", () => {
    for (const p of ["/about", "/terms", "/privacy", "/login", "/mypage", "/post", "/notifications", "/favorites"]) expect(welcomeMode({ ...base, pathname: p }), p).toBeNull();
  });
  it("ガイドは 3 ページで、最初のページでサイトが何かを説明する", () => {
    expect(WELCOME_STEPS).toHaveLength(3);
    expect(WELCOME_STEPS[0].body).toContain("口コミ");
  });
});
