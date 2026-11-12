import { useEffect, useRef, useState } from "react";
import { data, Link, useFetcher } from "react-router";
import type { Route } from "./+types/product";
import { getProduct, getProductChannels, listReviews, myVotes, publicReview, recalcProductRating, recalcReviewer, reviewStats, voteReview } from "~/lib/db.server";
import { getUser } from "~/lib/auth.server";
import { notify, setEaten } from "~/lib/engage.server";
import { notifyNewAchievements } from "~/lib/achievements.server";
import { parseSummary, SUMMARY_MIN_REVIEWS, summarizeProduct } from "~/lib/summary.server";
import { ReviewerAvatar, ReviewerName, tierCardClass } from "~/components/reviewer-badge";
import type { ReviewerStats } from "~/lib/reviewer-tier";
import { imgUrl, relativeDate, yen } from "~/lib/format";
import { needsReview } from "~/lib/moderation";
import { REPORT_REASONS } from "~/lib/reports";
import { addDays, todayJst } from "~/lib/weeks";
import { ProductVisual } from "~/components/product-visual";
import { StarInput } from "~/components/star-input";
import { Stars } from "~/components/stars";
import { AdSlot } from "~/components/ad-slot";
import { AffiliateLinks } from "~/components/affiliate-links";
import { ShareButtons } from "~/components/share-buttons";
import { BookmarkButton } from "~/components/bookmark-button";
import { EatenButton } from "~/components/eaten-button";
import { QuickReview } from "~/components/quick-review";

export const meta: Route.MetaFunction = ({ data }) =>
  data
    ? [
        { title: `${data.product.name}の口コミ・評価｜ひとくち` },
        { name: "description", content: `${data.product.name}（${data.product.maker ?? ""}）の口コミ${data.product.review_count}件。${data.product.description ?? ""}` },
        { tagName: "link", rel: "canonical", href: data.url },
        { property: "og:type", content: "article" },
        { property: "og:title", content: `${data.product.name}の口コミ・評価` },
        { property: "og:url", content: data.url },
        ...(data.product.image_url ? [{ property: "og:image", content: data.product.image_url }] : []),
        { name: "twitter:card", content: data.product.image_url ? "summary_large_image" : "summary" },
        {
          "script:ld+json": {
            "@context": "https://schema.org",
            "@type": "Product",
            name: data.product.name,
            ...(data.product.image_url ? { image: data.product.image_url } : {}),
            ...(data.product.maker ? { brand: { "@type": "Brand", name: data.product.maker } } : {}),
            ...(data.product.review_count
              ? { aggregateRating: { "@type": "AggregateRating", ratingValue: data.product.rating_avg, reviewCount: data.product.review_count, bestRating: 5, worstRating: 1 } }
              : {}),
          },
        },
      ]
    : [{ title: "商品が見つかりません｜ひとくち" }];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const id = Number(params.id);
  const product = Number.isInteger(id) ? await getProduct(db, id) : null;
  if (!product) throw data(null, { status: 404 });
  const sort = new URL(request.url).searchParams.get("sort") === "helpful" ? "helpful" : "new";
  const [rows, stats, channels] = await Promise.all([listReviews(db, id, sort), reviewStats(db, id), getProductChannels(db, id)]);
  const user = await getUser(request, context.cloudflare.env);
  const visitor = user?.id ?? null;
  const votes = await myVotes(db, visitor, rows.map((r) => r.id));
  // レビュアー ID はクライアントに渡さない（なりすまし防止）。「自分の口コミか」だけをサーバーで判定
  const reviews = rows.map((row) => ({ ...publicReview(row, visitor), myVote: (votes[row.id] ?? 0) as 1 | -1 | 0 }));
  const url = `${new URL(request.url).origin}/products/${id}`;
  const viewer = user ? { nickname: user.nickname } : null;
  const counts = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM bookmarks WHERE product_id = ?1) AS bookmarks,
              (SELECT COUNT(*) FROM eaten WHERE product_id = ?1) AS eaten,
              (SELECT COUNT(*) FROM reviews WHERE product_id = ?1 AND reviewer_id = ?2) AS mine`,
    )
    .bind(id, visitor ?? "")
    .first<{ bookmarks: number; eaten: number; mine: number }>();
  const bookmarkCount = counts?.bookmarks ?? 0;
  const eatenCount = counts?.eaten ?? 0;
  const reviewedByMe = (counts?.mine ?? 0) > 0;
  // ファーストレビューのチャンス（口コミ 0 件で発売から 3 日以内）
  const firstChance =
    product.review_count === 0 && !!product.released_on && todayJst() <= addDays(product.released_on, 3) && todayJst() >= addDays(product.released_on, -30);
  const returnPath = `/products/${id}#write`;
  const loginHref = `/login?returnTo=${encodeURIComponent(returnPath)}`;
  const summary = parseSummary(product.ai_summary ?? null);
  return { product, reviews, stats, channels, sort, url, viewer, loginHref, returnPath, bookmarkCount, eatenCount, reviewedByMe, firstChance, summary, summaryMin: SUMMARY_MIN_REVIEWS };
}

const MAX_IMAGE = 5 * 1024 * 1024;

export async function action({ params, request, context }: Route.ActionArgs) {
  const { DB, IMAGES } = context.cloudflare.env;
  const productId = Number(params.id);
  const form = await request.formData();
  const intent = form.get("intent");

  const user = await getUser(request, context.cloudflare.env);

  if (intent === "vote") {
    if (!user) return data({ ok: false as const, intent: "vote" as const, error: "Good / Bad にはログインが必要です" }, { status: 401 });
    const reviewId = Number(form.get("reviewId"));
    const value = form.get("value") === "bad" ? -1 : 1;
    const own = await DB.prepare("SELECT 1 FROM reviews WHERE id = ? AND product_id = ?").bind(reviewId, productId).first();
    if (!own) return data({ ok: false as const, intent: "vote" as const, error: "口コミが見つかりません" }, { status: 404 });
    const r = await voteReview(DB, reviewId, user.id, value);
    if ("error" in r) return data({ ok: false as const, intent: "vote" as const, error: r.error ?? "投票できませんでした" }, { status: 400 });
    return data({ ok: true as const, intent: "vote" as const, ...r });
  }

  if (intent === "report") {
    // ユーザー通報（ログイン必須・同じ口コミへの未対応の通報は 1 人 1 回）
    if (!user) return data({ ok: false as const, intent: "report" as const, error: "通報にはログインが必要です" }, { status: 401 });
    const reviewId = Number(form.get("reviewId"));
    const reason = String(form.get("reason"));
    if (!REPORT_REASONS.some((r) => r.id === reason)) return data({ ok: false as const, intent: "report" as const, error: "通報の理由を選んでください" }, { status: 400 });
    const target = await DB.prepare("SELECT reviewer_id FROM reviews WHERE id = ? AND product_id = ?").bind(reviewId, productId).first<{ reviewer_id: string | null }>();
    if (!target) return data({ ok: false as const, intent: "report" as const, error: "口コミが見つかりません" }, { status: 404 });
    if (target.reviewer_id === user.id) return data({ ok: false as const, intent: "report" as const, error: "自分の口コミは通報できません" }, { status: 400 });
    await DB.prepare("INSERT OR IGNORE INTO user_reports(reporter_id, target_user_id, review_id, reason, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, target.reviewer_id, reviewId, reason, String(form.get("detail") ?? "").trim().slice(0, 500) || null)
      .run();
    // 3 人以上から通報された口コミは自動で「要確認」（非公開）にして管理者の判断を待つ
    const n = await DB.prepare("SELECT COUNT(DISTINCT reporter_id) AS n FROM user_reports WHERE review_id = ? AND status = 'open'").bind(reviewId).first<{ n: number }>();
    if ((n?.n ?? 0) >= 3) {
      await DB.prepare("UPDATE reviews SET status = 'flagged' WHERE id = ? AND status = 'published'").bind(reviewId).run();
      await recalcProductRating(DB, productId);
    }
    return { ok: true as const, intent: "report" as const };
  }

  // レビュー投稿（ログイン必須・表示名はアカウントのニックネーム）
  if (!user) return data({ ok: false as const, intent: "review" as const, errors: { form: "口コミの投稿にはログインが必要です" } as Record<string, string> }, { status: 401 });
  if (!user.nickname) return data({ ok: false as const, intent: "review" as const, errors: { form: "マイページでニックネームを設定してください" } as Record<string, string> }, { status: 400 });
  const nickname = user.nickname;
  const rating = Number(form.get("rating"));
  const title = String(form.get("title") ?? "").trim().slice(0, 40);
  const body = String(form.get("body") ?? "").trim();
  const quick = form.get("quick") === "1"; // ひとこと口コミ（星＋60字まで）
  const axis = (k: string) => {
    const v = Number(form.get(k));
    return v >= 1 && v <= 5 ? v : null;
  };
  const errors: Record<string, string> = {};
  if (!(rating >= 1 && rating <= 5)) errors.rating = "総合評価を選んでください";
  if (quick) {
    if (body.length > 60) errors.body = "ひとことは60文字以内で入力してください";
  } else {
    if (body.length < 10) errors.body = "口コミは10文字以上で入力してください";
    if (body.length > 1000) errors.body = "口コミは1000文字以内で入力してください";
  }

  let imageKey: string | null = null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) errors.image = "画像ファイルを選んでください";
    else if (file.size > MAX_IMAGE) errors.image = "画像は5MB以下にしてください";
    else {
      imageKey = `reviews/${productId}/${crypto.randomUUID()}.${file.type.split("/")[1] ?? "jpg"}`;
    }
  }
  if (Object.keys(errors).length) return data({ ok: false as const, intent: "review" as const, errors }, { status: 400 });

  if (imageKey && file instanceof File) {
    await IMAGES.put(imageKey, file.stream(), { httpMetadata: { contentType: file.type } });
  }
  const recent = await DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE reviewer_id = ? AND product_id = ? AND created_at >= datetime('now', '-1 day')")
    .bind(user.id, productId)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 1) return data({ ok: false as const, intent: "review" as const, errors: { form: "同じ商品への口コミは1日1件までです" } as Record<string, string> }, { status: 429 });
  const status = needsReview(`${title} ${body} ${nickname}`) ? "flagged" : "published";
  // ファーストレビュー：まだ公開口コミが無く、発売（または掲載）から 3 日以内の最初の口コミ
  const fr = await DB.prepare(
    `SELECT p.name,
       CASE WHEN NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = p.id AND r.status = 'published')
             AND date('now', '+9 hours') <= date(COALESCE(p.released_on, date(p.created_at)), '+3 days') THEN 1 ELSE 0 END AS first
     FROM products p WHERE p.id = ?`,
  )
    .bind(productId)
    .first<{ name: string; first: number }>();
  const isFirst = status === "published" && fr?.first === 1;
  await DB.prepare(
    "INSERT INTO reviews(product_id, nickname, rating, taste, volume, value, title, body, image_key, status, reviewer_id, is_first, is_quick) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(productId, nickname, rating, quick ? null : axis("taste"), quick ? null : axis("volume"), quick ? null : axis("value"), quick ? null : title || null, body, quick ? null : imageKey, status, user.id, isFirst ? 1 : 0, quick ? 1 : 0)
    .run();
  await setEaten(DB, user.id, productId, true);
  await recalcProductRating(DB, productId);
  await recalcReviewer(DB, user.id, nickname);
  await notifyNewAchievements(DB, user.id);
  // 口コミが一定数たまったら AI 要約を作り直す（レスポンスを待たせないようバックグラウンドで）
  context.cloudflare.ctx.waitUntil(summarizeProduct(context.cloudflare.env, productId).catch((e) => console.error("summary", e)));
  if (isFirst && fr) {
    await notify(DB, { userId: user.id, kind: "first_review_bonus", productId, body: `「${fr.name}」のファーストレビューを獲得しました！ ボーナス +5pt`, link: `/products/${productId}` });
  }
  return data({ ok: true as const, intent: "review" as const, flagged: status === "flagged", first: isFirst });
}

export default function Product({ loaderData }: Route.ComponentProps) {
  const { product: p, reviews, stats, channels, sort, url, viewer, loginHref, returnPath, bookmarkCount, eatenCount, reviewedByMe, firstChance, summary, summaryMin } = loaderData;
  const total = stats.dist.reduce((a, b) => a + b.n, 0);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-3 md:pt-8">
      <nav className="mb-6 text-sm text-stone-500">
        <Link to="/" className="hover:text-stone-900 dark:hover:text-white">トップ</Link>
        <span className="mx-2">/</span>
        {p.category_slug && (
          <>
            <Link to={`/products?category=${p.category_slug}`} className="hover:text-stone-900 dark:hover:text-white">{p.category}</Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-stone-700 dark:text-stone-300">{p.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="rise overflow-hidden rounded-[2rem] ring-1 ring-stone-200/70 dark:ring-white/10">
          <ProductVisual imageUrl={p.image_url} imageKey={p.image_key} accent={p.accent} emoji={p.category_emoji} name={p.name} big className="aspect-square w-full" />
          {p.image_url && p.source_url && (
            <p className="border-t border-stone-200/70 bg-white px-4 py-2 text-right text-[11px] text-stone-400 dark:border-white/10 dark:bg-stone-900">
              画像出典：<a href={p.source_url} target="_blank" rel="noopener" className="underline hover:text-stone-600">{p.maker ?? "公式サイト"}</a>
            </p>
          )}
        </div>

        <div className="rise [animation-delay:80ms]">
          <p className="text-sm font-medium text-stone-500">{p.maker}</p>
          <h1 className="mt-1 font-display text-3xl font-black leading-tight sm:text-4xl">{p.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <BookmarkButton productId={p.id} variant="full" />
            <EatenButton productId={p.id} />
          </div>
          {(bookmarkCount > 0 || eatenCount > 0) && (
            <p className="mt-2 text-sm text-stone-500">
              {bookmarkCount > 0 && <span className="mr-3">❤️ {bookmarkCount}人が気になっています</span>}
              {eatenCount > 0 && <span>🍽️ {eatenCount}人が食べました</span>}
            </p>
          )}
          <QuickReview
            state={!viewer ? "anon" : !viewer.nickname ? "setup" : reviewedByMe ? "done" : "ready"}
            loginHref={`/login?returnTo=${encodeURIComponent(`/products/${p.id}#quick`)}`}
            setupHref={`/mypage?setup=1&returnTo=${encodeURIComponent(`/products/${p.id}#quick`)}`}
            firstChance={firstChance}
          />

          <div className="mt-5 flex items-center gap-4 rounded-3xl bg-white p-5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
            <div className="text-center">
              <p className="font-display text-5xl font-black">{p.review_count ? p.rating_avg.toFixed(1) : "—"}</p>
              <Stars value={p.rating_avg} size="md" />
              <p className="mt-1 text-xs text-stone-500">{p.review_count}件の口コミ</p>
            </div>
            <div className="flex-1 space-y-1.5">
              {stats.dist.map((d) => (
                <div key={d.rating} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-stone-500">{d.rating}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-brand-500 transition-all duration-700" style={{ width: total ? `${(d.n / total) * 100}%` : 0 }} />
                  </div>
                  <span className="w-5 text-right text-stone-400">{d.n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {(
              [
                ["味", stats.axes?.taste],
                ["量", stats.axes?.volume],
                ["コスパ", stats.axes?.value],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-2xl bg-white p-3 text-center ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
                <p className="text-xs text-stone-500">{label}</p>
                <p className="mt-0.5 text-lg font-bold">{v ? v.toFixed(1) : "—"}</p>
              </div>
            ))}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Spec k="価格" v={yen(p.price)} />
            <Spec k="カロリー" v={p.kcal ? `${p.kcal} kcal` : "—"} />
            <Spec k="発売日" v={p.released_on ? new Date(p.released_on).toLocaleDateString("ja-JP") : "—"} />
            <Spec k="販売店" v={channels.map((c) => c.name).join("・") || "—"} />
            {p.region && <div className="col-span-2"><Spec k="販売地域" v={p.region} /></div>}
          </dl>
          {p.description && (
            <div className="mt-6">
              <h2 className="mb-1.5 text-xs font-bold tracking-wider text-stone-400">商品説明</h2>
              <p className="leading-relaxed text-stone-700 dark:text-stone-300">{p.description}</p>
              {p.source_url && (
                <p className="mt-1.5 text-[11px] text-stone-400">
                  出典：<a href={p.source_url} target="_blank" rel="noopener" className="underline hover:text-stone-600">{p.maker ?? "公式サイト"} 商品ページ</a>
                </p>
              )}
            </div>
          )}
          <AffiliateLinks name={p.name} category={p.category_slug} />
          <div className="mt-6">
            <ShareButtons url={url} text={`${p.name}の口コミ #ひとくち`} />
          </div>
          <a href="#write" className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-rose-500 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:brightness-110">
            ✍️ 口コミを書く
          </a>
        </div>
      </div>

      <AdSlot className="mt-14" format="horizontal" />

      <section className="mt-12 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-black">みんなの口コミ</h2>
            <div className="flex rounded-full bg-stone-100 p-1 text-sm dark:bg-white/10">
              {(
                [
                  ["new", "新着順"],
                  ["helpful", "Goodが多い順"],
                ] as const
              ).map(([k, v]) => (
                <Link key={k} to={`?sort=${k}`} preventScrollReset className={`rounded-full px-3 py-1 transition ${sort === k ? "bg-white font-semibold shadow-sm dark:bg-stone-800" : "text-stone-500"}`}>
                  {v}
                </Link>
              ))}
            </div>
          </div>
          {summary ? (
            <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-50 to-sky-50 p-5 ring-1 ring-violet-200/70 dark:from-violet-500/[0.08] dark:to-sky-500/[0.06] dark:ring-violet-400/20">
              <p className="flex items-center gap-2 text-sm font-black">
                <span className="rounded-full bg-gradient-to-r from-violet-500 to-sky-500 px-2 py-0.5 text-[10px] text-white">AI</span>
                みんなの声まとめ
              </p>
              <p className="mt-2 leading-relaxed text-stone-700 dark:text-stone-300">{summary.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {summary.pros.map((x) => <span key={x} className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">👍 {x}</span>)}
                {summary.cons.map((x) => <span key={x} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">🤔 {x}</span>)}
              </div>
              <p className="mt-3 text-[11px] text-stone-400">口コミ{p.ai_summary_count}件をもとに AI が要約しています。内容は個人の感想に基づきます。</p>
            </div>
          ) : (
            p.review_count > 0 && p.review_count < summaryMin && (
              <p className="mb-4 text-xs text-stone-400">口コミが{summaryMin}件集まると、AI が「みんなの声」を要約します（あと{summaryMin - p.review_count}件）</p>
            )
          )}
          {reviews.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-stone-200 p-10 text-center text-stone-500 dark:border-white/10">
              <p className="text-4xl">🥄</p>
              <p className="mt-2">まだ口コミがありません。最初のひとくちをシェアしませんか？</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <ReviewCard key={r.id} r={r} loginHref={viewer ? null : loginHref} />
              ))}
            </div>
          )}
        </div>
        <ReviewForm viewer={viewer} loginHref={loginHref} returnPath={returnPath} />
      </section>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-b border-stone-200 pb-2 dark:border-white/10">
      <dt className="text-xs text-stone-500">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

type ReviewItem = Route.ComponentProps["loaderData"]["reviews"][number];

function ReviewCard({ r, loginHref }: { r: ReviewItem; loginHref: string | null }) {
  const vote = useFetcher<typeof action>();
  const report = useFetcher<typeof action>();
  const reported = report.data?.ok && report.data.intent === "report";
  const reportError = report.data && !report.data.ok && report.data.intent === "report" && "error" in report.data ? report.data.error : null;
  const [reporting, setReporting] = useState(false);

  // 楽観的更新：送信中は押したボタンの結果を先に表示
  const res = vote.data?.intent === "vote" ? vote.data : undefined;
  let mine: 1 | -1 | 0 = res && res.ok ? res.mine : r.myVote;
  let good = res && res.ok ? res.good : r.good_count;
  let bad = res && res.ok ? res.bad : r.bad_count;
  const pending = vote.formData?.get("value");
  if (pending) {
    const v = pending === "bad" ? -1 : 1;
    const next = mine === v ? 0 : v;
    good += (next === 1 ? 1 : 0) - (mine === 1 ? 1 : 0);
    bad += (next === -1 ? 1 : 0) - (mine === -1 ? 1 : 0);
    mine = next;
  }
  const error = res && !res.ok ? res.error : null;
  const img = imgUrl(r.image_key);
  const voteBtn = (on: boolean, tone: "good" | "bad") =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
      on
        ? tone === "good"
          ? "bg-emerald-500 text-white ring-emerald-500 shadow-sm shadow-emerald-500/30"
          : "bg-rose-500 text-white ring-rose-500 shadow-sm shadow-rose-500/30"
        : "ring-stone-200 text-stone-600 hover:bg-stone-50 dark:ring-white/10 dark:text-stone-300 dark:hover:bg-white/5"
    }`;

  return (
    <article className={`rounded-3xl bg-white p-5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10 ${tierCardClass(r.reviewer)}`}>
      <div className="flex items-start gap-3">
        <ReviewerAvatar nickname={r.nickname} stats={r.reviewer} src={r.author.avatarUrl} size={44} />
        <div className="min-w-0 flex-1">
          <ReviewerName nickname={r.nickname} stats={r.reviewer as ReviewerStats | null} ageGroup={r.author.ageGroup} gender={r.author.gender} isDemo={r.author.isDemo} />
          <p className="text-[11px] text-stone-400">
            {relativeDate(r.created_at)}
            {r.isMine && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-600 dark:bg-brand-500/10">あなたの口コミ</span>}
          </p>
        </div>
        <div className="shrink-0">
          <Stars value={r.rating} />
        </div>
      </div>
      {(r.is_first === 1 || r.is_quick === 1) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.is_first === 1 && <span className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-2.5 py-0.5 text-[11px] font-black text-amber-950">🥇 ファーストレビュー</span>}
          {r.is_quick === 1 && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-500 dark:bg-white/10">ひとこと口コミ</span>}
        </div>
      )}
      {r.title && <h3 className="mt-3 font-bold">{r.title}</h3>}
      {r.body && <p className="mt-1 whitespace-pre-wrap leading-relaxed text-stone-700 dark:text-stone-300">{r.body}</p>}
      {img && <img src={img} alt="" loading="lazy" className="mt-3 max-h-72 rounded-2xl object-cover" />}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
        {r.taste && <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-white/10">味 {r.taste}</span>}
        {r.volume && <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-white/10">量 {r.volume}</span>}
        {r.value && <span className="rounded-full bg-stone-100 px-2 py-0.5 dark:bg-white/10">コスパ {r.value}</span>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {loginHref ? (
          <a href={loginHref} className="flex items-center gap-2" title="ログインして投票">
            <span className={voteBtn(false, "good")}>👍 Good <span className="tabular-nums">{good}</span></span>
            <span className={voteBtn(false, "bad")}>👎 Bad <span className="tabular-nums">{bad}</span></span>
          </a>
        ) : (
        <vote.Form method="post" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="vote" />
          <input type="hidden" name="reviewId" value={r.id} />
          <button name="value" value="good" disabled={r.isMine} aria-pressed={mine === 1} className={voteBtn(mine === 1, "good")} title={r.isMine ? "自分の口コミには投票できません" : "この口コミは参考になった"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6c-.4.4-.6.9-.6 1.4V19a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>
            Good <span className="tabular-nums">{good}</span>
          </button>
          <button name="value" value="bad" disabled={r.isMine} aria-pressed={mine === -1} className={voteBtn(mine === -1, "bad")} title={r.isMine ? "自分の口コミには投票できません" : "この口コミは参考にならなかった"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: "scaleY(-1)" }}><path d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6c-.4.4-.6.9-.6 1.4V19a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>
            Bad <span className="tabular-nums">{bad}</span>
          </button>
        </vote.Form>
        )}
        {error && <span className="text-xs text-rose-600">{error}</span>}
        {!r.isMine && (
          <span className="ml-auto">
            {reported ? (
              <span className="text-xs text-stone-400">通報を受け付けました</span>
            ) : loginHref ? (
              <a href={loginHref} className="text-xs text-stone-400 hover:text-stone-600">通報する</a>
            ) : (
              <button type="button" onClick={() => setReporting((v) => !v)} className="text-xs text-stone-400 hover:text-stone-600" aria-expanded={reporting}>
                通報する
              </button>
            )}
          </span>
        )}
      </div>
      {reporting && !reported && (
        <report.Form method="post" className="mt-3 space-y-3 rounded-2xl bg-stone-50 p-4 dark:bg-white/5">
          <input type="hidden" name="intent" value="report" />
          <input type="hidden" name="reviewId" value={r.id} />
          <p className="text-sm font-semibold">この口コミ・ユーザーを通報</p>
          <fieldset className="grid gap-1.5 sm:grid-cols-2">
            <legend className="sr-only">通報の理由</legend>
            {REPORT_REASONS.map((x) => (
              <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 has-[:checked]:ring-2 has-[:checked]:ring-rose-400 dark:bg-stone-900 dark:ring-white/10">
                <input type="radio" name="reason" value={x.id} required className="accent-rose-500" /> {x.label}
              </label>
            ))}
          </fieldset>
          <textarea name="detail" rows={2} maxLength={500} placeholder="詳しい内容（任意）" className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-rose-300 dark:bg-stone-900 dark:ring-white/10" />
          {reportError && <p className="text-xs text-rose-600">{reportError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReporting(false)} className="rounded-full px-4 py-1.5 text-sm ring-1 ring-stone-300 dark:ring-white/20">やめる</button>
            <button disabled={report.state !== "idle"} className="rounded-full bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60">通報する</button>
          </div>
          <p className="text-[11px] text-stone-400">通報は管理者が確認し、必要に応じて口コミの非公開やアカウント停止などの対応を行います。通報者が相手に知らされることはありません。</p>
        </report.Form>
      )}
    </article>
  );
}

function ReviewForm({ viewer, loginHref, returnPath }: { viewer: { nickname: string | null } | null; loginHref: string; returnPath: string }) {
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const res = fetcher.data?.intent === "review" ? fetcher.data : undefined;
  const errors = res && !res.ok && "errors" in res ? res.errors : {};
  const done = res?.ok;
  useEffect(() => {
    if (done) formRef.current?.reset();
  }, [done]);
  const field =
    "w-full rounded-xl bg-stone-50 px-3 py-2.5 text-sm outline-none ring-1 ring-stone-200 focus:bg-white focus:ring-2 focus:ring-brand-400 dark:bg-white/5 dark:ring-white/10";
  const card = "rounded-3xl bg-white p-6 shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10";
  if (!viewer || !viewer.nickname) {
    return (
      <aside id="write" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
        <div className={`${card} text-center`}>
          <p className="text-4xl">✍️</p>
          <h2 className="mt-2 font-display text-xl font-black">口コミを書く</h2>
          <p className="mt-2 text-sm text-stone-500">
            {viewer ? "口コミを書く前に、表示名（ニックネーム）を設定してください。" : "口コミの投稿には Google アカウントでのログインが必要です。"}
          </p>
          <a
            href={viewer ? `/mypage?setup=1&returnTo=${encodeURIComponent(returnPath)}` : loginHref}
            className="mt-5 inline-block w-full rounded-xl bg-stone-900 py-3 font-semibold text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900"
          >
            {viewer ? "ニックネームを設定する" : "ログインして口コミを書く"}
          </a>
        </div>
      </aside>
    );
  }
  return (
    <aside id="write" className="scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
      <fetcher.Form ref={formRef} method="post" encType="multipart/form-data" className="space-y-4 rounded-3xl bg-white p-6 shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-black">口コミを書く</h2>
          <span className="truncate text-xs text-stone-400">投稿者：{viewer.nickname}</span>
        </div>
        {errors.form && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{errors.form}</p>}
        {done && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            {res && "flagged" in res && res.flagged
              ? "投稿を受け付けました。内容を確認のうえ公開します。"
              : res && "first" in res && res.first
                ? "🥇 ファーストレビュー獲得！ボーナス +5pt"
                : "投稿ありがとうございます！🎉"}
          </p>
        )}
        <StarInput name="rating" label="総合評価" required />
        {errors.rating && <p className="text-xs text-rose-600">{errors.rating}</p>}
        <div className="grid grid-cols-3 gap-2">
          <StarInput name="taste" label="味" size={16} />
          <StarInput name="volume" label="量" size={16} />
          <StarInput name="value" label="コスパ" size={16} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold" htmlFor="title">タイトル（任意）</label>
          <input id="title" name="title" maxLength={40} className={field} placeholder="ひとことで言うと？" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold" htmlFor="body">口コミ</label>
          <textarea id="body" name="body" rows={5} maxLength={1000} className={field} placeholder="味・食感・おすすめポイントなど" />
          {errors.body && <p className="mt-1 text-xs text-rose-600">{errors.body}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold" htmlFor="image">写真（任意・5MBまで）</label>
          <input id="image" name="image" type="file" accept="image/*" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white dark:file:bg-white dark:file:text-stone-900" />
          {errors.image && <p className="mt-1 text-xs text-rose-600">{errors.image}</p>}
        </div>
        <button
          disabled={fetcher.state !== "idle"}
          className="w-full rounded-xl bg-stone-900 py-3 font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60 dark:bg-white dark:text-stone-900"
        >
          {fetcher.state !== "idle" ? "送信中…" : "投稿する"}
        </button>
      </fetcher.Form>
    </aside>
  );
}
