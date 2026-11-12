import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { recalcProductRating, recalcReviewer, toggleBookmark, voteReview, bookmarkedIds } from "~/lib/db.server";
import { generateNotifications, unreadCount } from "~/lib/engage.server";
import { suspendable, suspendUser, unsuspendUser } from "~/lib/suspension.server";
import { getUser, createSession } from "~/lib/auth.server";
import { addProduct, addReview, addUser, count, day } from "../helpers";

const reviewOf = (id: number) => env.DB.prepare("SELECT good_count, bad_count, status FROM reviews WHERE id = ?").bind(id).first<{ good_count: number; bad_count: number; status: string }>();

describe("口コミの Good / Bad", () => {
  it("Good を付けると件数とレビュアーの集計が増える", async () => {
    const [author, voter] = [await addUser(), await addUser()];
    const review = await addReview(await addProduct(), author);
    expect(await voteReview(env.DB, review, voter, 1)).toEqual({ mine: 1, good: 1, bad: 0 });
    const r = await env.DB.prepare("SELECT review_count, good_received FROM reviewers WHERE id = ?").bind(author).first();
    expect(r).toEqual({ review_count: 1, good_received: 1 });
  });
  it("同じボタンをもう一度押すと取り消し、逆を押すと切り替わる", async () => {
    const [author, voter] = [await addUser(), await addUser()];
    const review = await addReview(await addProduct(), author);
    await voteReview(env.DB, review, voter, 1);
    expect(await voteReview(env.DB, review, voter, 1)).toMatchObject({ mine: 0, good: 0 });
    await voteReview(env.DB, review, voter, 1);
    expect(await voteReview(env.DB, review, voter, -1)).toEqual({ mine: -1, good: 0, bad: 1 });
  });
  it("自分の口コミ・非公開の口コミには投票できない", async () => {
    const author = await addUser();
    const product = await addProduct();
    expect(await voteReview(env.DB, await addReview(product, author), author, 1)).toHaveProperty("error");
    expect(await voteReview(env.DB, await addReview(product, author, { status: "hidden" }), await addUser(), 1)).toHaveProperty("error");
    expect(await voteReview(env.DB, 999999, author, 1)).toHaveProperty("error");
  });
  it("Bad が 5 件以上で Good の 2 倍を超えたら自動で要確認（非公開）にする", async () => {
    const review = await addReview(await addProduct(), await addUser());
    for (let i = 0; i < 4; i++) await voteReview(env.DB, review, await addUser(), -1);
    expect((await reviewOf(review))!.status).toBe("published");
    await voteReview(env.DB, review, await addUser(), -1);
    expect(await reviewOf(review)).toEqual({ good_count: 0, bad_count: 5, status: "flagged" });
  });
});

describe("商品の評価の集計", () => {
  it("公開中の口コミだけで平均と件数を計算する", async () => {
    const product = await addProduct();
    await addReview(product, await addUser(), { rating: 5 });
    await addReview(product, await addUser(), { rating: 2 });
    await addReview(product, await addUser(), { rating: 1, status: "hidden" });
    await recalcProductRating(env.DB, product);
    expect(await env.DB.prepare("SELECT rating_avg, review_count FROM products WHERE id = ?").bind(product).first()).toEqual({ rating_avg: 3.5, review_count: 2 });
  });
});

describe("気になる・通知", () => {
  it("気になるの登録と解除", async () => {
    const [user, product] = [await addUser(), await addProduct()];
    await toggleBookmark(env.DB, user, product, true);
    await toggleBookmark(env.DB, user, product, true); // 二重登録しても 1 件
    expect(await bookmarkedIds(env.DB, user)).toEqual([product]);
    await toggleBookmark(env.DB, user, product, false);
    expect(await bookmarkedIds(env.DB, user)).toEqual([]);
  });
  it("気になる商品の発売日に通知し、同じ通知は二度作らない", async () => {
    const user = await addUser();
    const product = await addProduct({ releasedOn: day(0) });
    await toggleBookmark(env.DB, user, product, true);
    expect((await generateNotifications(env.DB, day(0))).releaseToday).toBe(1);
    expect((await generateNotifications(env.DB, day(0))).releaseToday).toBe(0);
    expect(await unreadCount(env.DB, user)).toBe(1);
  });
  it("発売から 3〜21 日たっても口コミが無ければ声をかける（書いた人には送らない）", async () => {
    const [quiet, wrote] = [await addUser(), await addUser()];
    const product = await addProduct({ releasedOn: day(-5) });
    await toggleBookmark(env.DB, quiet, product, true);
    await toggleBookmark(env.DB, wrote, product, true);
    await addReview(product, wrote);
    await generateNotifications(env.DB, day(0));
    expect(await count("SELECT COUNT(*) n FROM notifications WHERE kind = 'ask_review' AND user_id = ?", quiet)).toBe(1);
    expect(await count("SELECT COUNT(*) n FROM notifications WHERE kind = 'ask_review' AND user_id = ?", wrote)).toBe(0);
  });
});

describe("アカウント停止", () => {
  it("停止するとログインが切れ、口コミが非表示になり、解除すると元に戻る", async () => {
    const user = await addUser();
    const product = await addProduct();
    const review = await addReview(product, user, { rating: 5 });
    const alreadyHidden = await addReview(product, user, { status: "hidden" });
    await recalcProductRating(env.DB, product);
    const cookie = (await createSession(new Request("https://hitokuchi.example.test/"), env, user)).split(";")[0];
    const asUser = () => getUser(new Request("https://hitokuchi.example.test/", { headers: { Cookie: cookie } }), env);
    expect((await asUser())?.id).toBe(user);

    expect(await suspendUser(env, user, "規約違反", "owner@example.test")).toEqual({ hiddenReviews: 1 });
    expect(await asUser()).toBeNull();
    expect((await reviewOf(review))!.status).toBe("hidden");
    expect(await count("SELECT review_count n FROM products WHERE id = ?", product)).toBe(0);

    await unsuspendUser(env, user);
    expect((await reviewOf(review))!.status).toBe("published");
    expect((await reviewOf(alreadyHidden))!.status).toBe("hidden"); // 停止前から非表示だったものは戻さない
    expect(await count("SELECT review_count n FROM products WHERE id = ?", product)).toBe(1);
  });
  it("管理者・オーナー・自分自身は停止できない", async () => {
    const admin = await addUser({ role: "admin" });
    const owner = await addUser({ email: "Owner@example.test" });
    const user = await addUser();
    expect(await suspendable(env, admin, user)).toHaveProperty("error");
    expect(await suspendable(env, owner, admin)).toHaveProperty("error");
    expect(await suspendable(env, admin, admin)).toHaveProperty("error");
    expect(await suspendable(env, "no-such-user", admin)).toHaveProperty("error");
    expect(await suspendable(env, user, admin)).toHaveProperty("user");
  });
});

describe("レビュアー集計", () => {
  it("公開中の口コミだけを数え、ファーストレビューも集計する", async () => {
    const user = await addUser();
    const product = await addProduct();
    await addReview(product, user, { isFirst: true });
    await addReview(product, user, { status: "flagged" });
    await recalcReviewer(env.DB, user, "あたらしい名前");
    expect(await env.DB.prepare("SELECT nickname, review_count, first_count FROM reviewers WHERE id = ?").bind(user).first()).toEqual({ nickname: "あたらしい名前", review_count: 1, first_count: 1 });
  });
});
