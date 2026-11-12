import { ConfirmButton } from "~/components/confirm-button";
import { Form, Link, data, redirect, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/mypage";
import { destroySession, requireUser, safeReturnTo, validateNickname } from "~/lib/auth.server";
import { removeAvatar, saveAvatar } from "~/lib/avatar.server";
import { bookmarkedProducts, recalcProductRating, recalcReviewer } from "~/lib/db.server";
import { getAchievements } from "~/lib/achievements.server";
import { AGE_GROUPS, GENDERS, demographicLabel } from "~/lib/profile";
import { tierOf, TIERS } from "~/lib/reviewer-tier";
import { relativeDate } from "~/lib/format";
import { ReviewerAvatar, ReviewerName } from "~/components/reviewer-badge";
import { AvatarUploader } from "~/components/avatar-uploader";
import { ProductCard } from "~/components/product-card";
import { Stars } from "~/components/stars";

export const meta: Route.MetaFunction = () => [{ title: "マイページ｜ひとくち" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") === "bookmarks" ? "bookmarks" : "reviews";
  const [stats, reviews, bookmarks, achievements] = await Promise.all([
    env.DB.prepare("SELECT review_count, good_received, bad_received, first_count FROM reviewers WHERE id = ?")
      .bind(user.id)
      .first<{ review_count: number; good_received: number; bad_received: number; first_count: number }>(),
    env.DB.prepare(
      `SELECT r.id, r.product_id, p.name AS product_name, r.rating, r.title, r.body, r.status, r.good_count, r.created_at
       FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.reviewer_id = ? ORDER BY r.created_at DESC LIMIT 100`,
    )
      .bind(user.id)
      .all<{ id: number; product_id: number; product_name: string; rating: number; title: string | null; body: string; status: string; good_count: number; created_at: string }>(),
    bookmarkedProducts(env.DB, user.id),
    getAchievements(env.DB, user.id),
  ]);
  return {
    me: {
      nickname: user.nickname,
      email: user.email,
      avatarUrl: user.avatar_key ? `/img/${encodeURIComponent(user.avatar_key)}` : null,
      ageGroup: user.age_group,
      gender: user.gender,
      showAge: !!user.show_age,
      showGender: !!user.show_gender,
      digest: !!user.digest_opt_in,
    },
    stats: stats ?? { review_count: 0, good_received: 0, bad_received: 0, first_count: 0 },
    achievements,
    reviews: reviews.results,
    bookmarks,
    tab,
    setup: !user.nickname || url.searchParams.has("setup"),
    returnTo: safeReturnTo(url.searchParams.get("returnTo")),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { DB } = env;
  const user = await requireUser(request, env, "/mypage");
  const form = await request.formData();
  const intent = String(form.get("intent"));

  // 初回のニックネーム設定
  if (intent === "nickname") {
    const v = validateNickname(String(form.get("nickname") ?? ""));
    if ("error" in v) return data({ intent, error: v.error }, { status: 400 });
    const taken = await DB.prepare("SELECT 1 FROM users WHERE nickname = ? AND id != ?").bind(v.nickname, user.id).first();
    if (taken) return data({ intent, error: "このニックネームは既に使われています" }, { status: 409 });
    await DB.prepare("UPDATE users SET nickname = ? WHERE id = ?").bind(v.nickname, user.id).run();
    throw redirect(safeReturnTo(String(form.get("returnTo") ?? "/mypage")));
  }

  // プロフィール（画像・ニックネーム・年代・性別・公開設定）
  if (intent === "profile") {
    const v = validateNickname(String(form.get("nickname") ?? ""));
    if ("error" in v) return data({ intent, error: v.error }, { status: 400 });
    const taken = await DB.prepare("SELECT 1 FROM users WHERE nickname = ? AND id != ?").bind(v.nickname, user.id).first();
    if (taken) return data({ intent, error: "このニックネームは既に使われています" }, { status: 409 });

    const file = form.get("avatar");
    if (file instanceof File && file.size > 0) {
      const r = await saveAvatar(env, user.id, user.avatar_key, file);
      if ("error" in r) return data({ intent, error: r.error }, { status: 400 });
    } else if (form.get("remove_avatar") === "1") {
      await removeAvatar(env, user.id, user.avatar_key);
    }

    const age = String(form.get("age_group") ?? "");
    const gender = String(form.get("gender") ?? "");
    await DB.batch([
      DB.prepare("UPDATE users SET nickname = ?, age_group = ?, gender = ?, show_age = ?, show_gender = ? WHERE id = ?").bind(
        v.nickname,
        AGE_GROUPS.some((a) => a.id === age) ? age : null,
        GENDERS.some((g) => g.id === gender) ? gender : null,
        form.get("show_age") === "on" ? 1 : 0,
        form.get("show_gender") === "on" ? 1 : 0,
        user.id,
      ),
      DB.prepare("UPDATE reviews SET nickname = ? WHERE reviewer_id = ?").bind(v.nickname, user.id),
      DB.prepare("UPDATE reviewers SET nickname = ? WHERE id = ?").bind(v.nickname, user.id),
    ]);
    return { intent, ok: true };
  }

  // ダイジェストメールの受け取り（切り替えた瞬間に保存）
  if (intent === "digest") {
    const on = form.get("on") === "1";
    await DB.prepare("UPDATE users SET digest_opt_in = ? WHERE id = ?").bind(on ? 1 : 0, user.id).run();
    return { intent, ok: true, on };
  }

  if (intent === "delete-review") {
    const id = Number(form.get("reviewId"));
    const row = await DB.prepare("SELECT product_id FROM reviews WHERE id = ? AND reviewer_id = ?").bind(id, user.id).first<{ product_id: number }>();
    if (row) {
      await DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
      await recalcProductRating(DB, row.product_id);
      await recalcReviewer(DB, user.id);
    }
    return { intent, ok: true };
  }

  if (intent === "delete-account") {
    if (form.get("confirm") !== "退会する") return data({ intent, error: "確認のため「退会する」と入力してください" }, { status: 400 });
    // 自分の口コミ・投票・気になる・画像・アカウントを削除し、影響を受けた集計を直す
    const products = (await DB.prepare("SELECT DISTINCT product_id FROM reviews WHERE reviewer_id = ?").bind(user.id).all<{ product_id: number }>()).results;
    const voted = (
      await DB.prepare("SELECT DISTINCT r.id, r.reviewer_id FROM review_votes v JOIN reviews r ON r.id = v.review_id WHERE v.voter_id = ?")
        .bind(user.id)
        .all<{ id: number; reviewer_id: string | null }>()
    ).results;
    await DB.batch([
      DB.prepare("DELETE FROM review_votes WHERE voter_id = ?").bind(user.id),
      DB.prepare("DELETE FROM reviews WHERE reviewer_id = ?").bind(user.id),
      DB.prepare("DELETE FROM reviewers WHERE id = ?").bind(user.id),
    ]);
    for (const r of voted) {
      await DB.prepare(
        `UPDATE reviews SET good_count = (SELECT COUNT(*) FROM review_votes WHERE review_id = ?1 AND value = 1),
           bad_count = (SELECT COUNT(*) FROM review_votes WHERE review_id = ?1 AND value = -1) WHERE id = ?1`,
      )
        .bind(r.id)
        .run();
      if (r.reviewer_id && r.reviewer_id !== user.id) await recalcReviewer(DB, r.reviewer_id);
    }
    for (const p of products) await recalcProductRating(DB, p.product_id);
    if (user.avatar_key) await env.IMAGES.delete(user.avatar_key);
    const clear = await destroySession(request, env);
    await DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run(); // 気になる・セッションは CASCADE で削除
    throw redirect("/", { headers: { "Set-Cookie": clear } });
  }
  return null;
}

export default function MyPage({ loaderData, actionData }: Route.ComponentProps) {
  const { me, stats, reviews, bookmarks, achievements, tab, setup, returnTo } = loaderData;
  const busy = useNavigation().state !== "idle";
  const tier = tierOf(stats);
  const progress = tier.next ? Math.min(100, Math.round(((tier.points - tier.min) / (tier.next.min - tier.min)) * 100)) : 100;
  const err = (i: string) => (actionData && "error" in actionData && actionData.intent === i ? actionData.error : null);
  const profileOk = actionData && "ok" in actionData && actionData.intent === "profile";
  const field = "w-full rounded-xl bg-stone-50 px-3 py-2.5 outline-none ring-1 ring-stone-200 focus:bg-white focus:ring-2 focus:ring-brand-400 dark:bg-white/5 dark:ring-white/10";
  const publicDemo = demographicLabel(me.showAge ? me.ageGroup : null, me.showGender ? me.gender : null);

  // 初回：ニックネーム設定
  if (!me.nickname) {
    return (
      <div className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 py-16">
        <Form method="post" className="w-full rounded-[2rem] bg-white p-8 shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
          <p className="text-center text-4xl">👋</p>
          <h1 className="mt-2 text-center font-display text-2xl font-black">ようこそ！</h1>
          <p className="mt-2 text-center text-sm text-stone-500">口コミに表示されるニックネームを決めてください。Google アカウントの名前は公開されません。</p>
          <input type="hidden" name="intent" value="nickname" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="mt-6 block">
            <span className="mb-1.5 block text-sm font-semibold">ニックネーム（2〜16文字）</span>
            <input name="nickname" required minLength={2} maxLength={16} autoFocus className={field} placeholder="例：おやつ係" />
          </label>
          {err("nickname") && <p className="mt-2 text-sm text-rose-600">{err("nickname")}</p>}
          <button disabled={busy} className="mt-5 w-full rounded-xl bg-stone-900 py-3 font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60 dark:bg-white dark:text-stone-900">
            はじめる
          </button>
          <p className="mt-4 text-center text-xs text-stone-400">プロフィール画像・年代・性別はあとからマイページで設定できます</p>
        </Form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 md:pt-10">
      {/* プロフィール */}
      <section className="relative overflow-hidden rounded-[2rem] bg-stone-900 p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <ReviewerAvatar nickname={me.nickname} stats={stats} size={80} src={me.avatarUrl} />
          <div className="min-w-0 flex-1 [&_span.text-sm]:text-xl [&_span.text-sm]:text-white [&_.text-stone-500]:text-stone-300">
            <ReviewerName nickname={me.nickname} stats={stats} showStats={false} ageGroup={me.showAge ? me.ageGroup : null} gender={me.showGender ? me.gender : null} />
            <p className="mt-1 text-xs text-stone-400">ログイン中：{me.email}（非公開）</p>
          </div>
          <Form method="post" action="/auth/logout">
            <button className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">ログアウト</button>
          </Form>
        </div>
        <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["口コミ", stats.review_count],
            ["もらった Good", stats.good_received],
            ["ファーストレビュー", stats.first_count],
            ["ポイント", tier.points],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/[0.07] p-4">
              <p className="text-xs text-stone-400">{k}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <div className="relative mt-6">
          <div className="flex justify-between gap-3 text-xs text-stone-400">
            <span>{tier.icon} {tier.label}</span>
            <span>{tier.next ? `${tier.next.icon} ${tier.next.label}まであと ${tier.next.min - tier.points} pt` : "最高ランクです 🎉"}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 via-rose-400 to-fuchsia-400 transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-stone-500">口コミ・Good・ファーストレビューでポイントが貯まります ／ ランク：{[...TIERS].reverse().filter((t) => t.min > 0).map((t) => `${t.icon}${t.min}`).join(" ・ ")}</p>
        </div>
      </section>

      {/* 実績バッジ */}
      <section id="achievements" className="mt-8 scroll-mt-24">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-black">実績バッジ</h2>
          <span className="text-sm text-stone-500">{achievements.filter((a) => a.unlocked).length} / {achievements.length} 解除</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl p-4 ring-1 transition ${
                a.unlocked
                  ? "bg-gradient-to-br from-amber-50 to-white ring-amber-200 dark:from-amber-500/10 dark:to-stone-900 dark:ring-amber-400/30"
                  : "bg-white ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-2xl ${a.unlocked ? "bg-white shadow-md ring-2 ring-amber-300 dark:bg-stone-800" : "bg-stone-100 grayscale opacity-50 dark:bg-white/5"}`}>
                  {a.icon}
                </span>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-bold ${a.unlocked ? "" : "text-stone-400"}`}>{a.name}</p>
                  <p className="text-[11px] leading-snug text-stone-500">{a.desc}</p>
                </div>
              </div>
              {!a.unlocked && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[10px] tabular-nums text-stone-400">{a.progress} / {a.goal}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        <section>
          {/* タブ */}
          <div className="mb-5 flex w-fit gap-1 rounded-full bg-stone-100 p-1 text-sm dark:bg-white/10">
            {(
              [
                ["reviews", `口コミ（${reviews.length}）`],
                ["bookmarks", `気になる（${bookmarks.length}）`],
              ] as const
            ).map(([k, v]) => (
              <Link key={k} to={k === "reviews" ? "/mypage" : "/mypage?tab=bookmarks"} preventScrollReset className={`rounded-full px-4 py-1.5 transition ${tab === k ? "bg-white font-semibold shadow-sm dark:bg-stone-800" : "text-stone-500"}`}>
                {v}
              </Link>
            ))}
          </div>

          {tab === "bookmarks" && bookmarks.length > 0 && (
            <p className="-mt-2 mb-4 text-right text-sm"><Link to="/favorites" className="text-rose-500 hover:underline">「気になる」ページで見る →</Link></p>
          )}
          {tab === "bookmarks" ? (
            bookmarks.length === 0 ? (
              <Empty icon="❤️" text="「気になる」に登録した商品はまだありません。商品の ♡ を押すとここに保存されます。" />
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {bookmarks.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
              </div>
            )
          ) : reviews.length === 0 ? (
            <Empty icon="🍙" text="まだ口コミがありません。" />
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/products/${r.product_id}`} className="font-bold hover:underline">{r.product_name}</Link>
                    <Stars value={r.rating} />
                    {r.status !== "published" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{r.status === "flagged" ? "確認中" : "非公開"}</span>}
                    <span className="ml-auto text-xs text-stone-400">{relativeDate(r.created_at)}</span>
                  </div>
                  {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                  <p className="mt-1 line-clamp-3 text-sm text-stone-600 dark:text-stone-400">{r.body}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
                    <span>👍 Good {r.good_count}</span>
                    <Form method="post" className="ml-auto">
                      <input type="hidden" name="intent" value="delete-review" />
                      <input type="hidden" name="reviewId" value={r.id} />
                      <ConfirmButton disabled={busy} className="text-rose-500 hover:text-rose-700" message="削除すると元に戻せません" confirmText="削除する">
                        削除
                      </ConfirmButton>
                    </Form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* プロフィール設定 */}
        <aside className="space-y-6">
          <DigestSetting initial={me.digest} email={me.email} />
          <Form method="post" encType="multipart/form-data" id="profile" className={`space-y-5 rounded-2xl bg-white p-5 ring-1 dark:bg-stone-900 ${setup ? "ring-2 ring-brand-400" : "ring-stone-200/70 dark:ring-white/10"}`}>
            <h2 className="font-bold">プロフィール設定</h2>
            <input type="hidden" name="intent" value="profile" />

            <div>
              <p className="mb-2 text-sm font-semibold">プロフィール画像</p>
              <AvatarUploader current={me.avatarUrl} nickname={me.nickname} />
              {me.avatarUrl && (
                <label className="mt-2 flex items-center gap-2 text-xs text-stone-500">
                  <input type="checkbox" name="remove_avatar" value="1" className="accent-stone-900" /> 画像を削除する
                </label>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">ニックネーム</span>
              <input name="nickname" defaultValue={me.nickname} required minLength={2} maxLength={16} className={field} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">年代</span>
                <select name="age_group" defaultValue={me.ageGroup ?? ""} className={field}>
                  <option value="">未設定</option>
                  {AGE_GROUPS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">性別</span>
                <select name="gender" defaultValue={me.gender ?? ""} className={field}>
                  <option value="">未設定</option>
                  {GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </label>
            </div>

            <fieldset className="space-y-2 rounded-xl bg-stone-50 p-3 dark:bg-white/5">
              <legend className="sr-only">公開設定</legend>
              <p className="text-xs font-semibold text-stone-500">口コミに表示する項目</p>
              <Toggle name="show_age" defaultChecked={me.showAge} label="年代を表示する" />
              <Toggle name="show_gender" defaultChecked={me.showGender} label="性別を表示する" />
              <p className="pt-1 text-[11px] text-stone-400">現在の表示：{publicDemo ?? "表示しない"}</p>
            </fieldset>

            {err("profile") && <p className="text-sm text-rose-600">{err("profile")}</p>}
            {profileOk && <p className="text-sm text-emerald-600">保存しました。</p>}
            <button disabled={busy} className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-stone-900">
              {busy ? "保存中…" : "保存"}
            </button>
          </Form>

          <details className="rounded-2xl bg-white p-5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
            <summary className="cursor-pointer text-sm font-semibold text-stone-500">退会する</summary>
            <Form method="post" className="mt-3 space-y-3">
              <p className="text-sm text-stone-600 dark:text-stone-400">アカウントと、あなたの口コミ・Good / Bad・気になる・プロフィール画像がすべて削除されます。元に戻せません。</p>
              <input type="hidden" name="intent" value="delete-account" />
              <input name="confirm" placeholder="確認のため「退会する」と入力" className={field} />
              {err("delete-account") && <p className="text-sm text-rose-600">{err("delete-account")}</p>}
              <button disabled={busy} className="w-full rounded-xl py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60 dark:ring-rose-500/30 dark:hover:bg-rose-500/10">
                退会する
              </button>
            </Form>
          </details>
        </aside>
      </div>
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-stone-200 p-10 text-center text-stone-500 dark:border-white/10">
      <p className="text-4xl">{icon}</p>
      <p className="mt-2 text-sm">{text}</p>
      <Link to="/weekly" className="mt-4 inline-block rounded-full bg-stone-900 px-5 py-2 text-sm font-semibold text-white dark:bg-white dark:text-stone-900">今週の新商品を見る</Link>
    </div>
  );
}

function Toggle({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-stone-300 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 dark:bg-stone-700" />
    </label>
  );
}

/** 週1回のダイジェストの受け取り設定（スイッチを切り替えるとすぐ保存） */
function DigestSetting({ initial, email }: { initial: boolean; email: string }) {
  const fetcher = useFetcher<{ ok: boolean; on: boolean }>();
  const pending = fetcher.formData?.get("on");
  const on = pending != null ? pending === "1" : fetcher.data?.ok ? fetcher.data.on : initial;
  return (
    <section id="digest" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
      <h2 className="font-bold">📮 メールの受け取り</h2>
      <fetcher.Form method="post" className="mt-3">
        <input type="hidden" name="intent" value="digest" />
        <input type="hidden" name="on" value={on ? "0" : "1"} />
        <button type="submit" role="switch" aria-checked={on} className="flex w-full items-center justify-between gap-3 text-left text-sm">
          <span>
            <span className="block font-semibold">週1回の新商品ダイジェスト</span>
            <span className="text-xs text-stone-500">毎週月曜の朝にお届け</span>
          </span>
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-500" : "bg-stone-300 dark:bg-stone-700"}`}>
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`} />
          </span>
        </button>
      </fetcher.Form>
      <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
        「気になる」商品の今週の発売情報と、あなたへのおすすめを {email} にお送りします。
        <a href="/mypage/digest" className="ml-1 underline">内容をプレビュー</a>
      </p>
      <p className={`mt-2 text-xs font-semibold ${on ? "text-emerald-600" : "text-stone-400"}`}>{on ? "✓ 受け取る設定になっています" : "受け取らない設定です"}</p>
    </section>
  );
}
