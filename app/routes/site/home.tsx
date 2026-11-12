import { Link } from "react-router";
import type { Route } from "./+types/home";
import { latestReviews, listCategories, listProducts, publicReview, weekProducts } from "~/lib/db.server";
import { ReviewerAvatar, ReviewerName, tierCardClass } from "~/components/reviewer-badge";
import { getUser } from "~/lib/auth.server";
import { battleVoterKey, ensureBattles, getBattles } from "~/lib/battles.server";
import { BattleCard } from "~/components/battle-card";
import { recommendFor } from "~/lib/recommend.server";
import { themeGradient } from "~/lib/features";
import { listCustomFeatures } from "~/lib/custom-features.server";
import { AdSlot } from "~/components/ad-slot";
import { CHAIN_ORDER, addDays, mondayOf, shortWeekLabel, todayJst } from "~/lib/weeks";
import { ProductCard } from "~/components/product-card";
import { LogoMark } from "~/components/logo";
import { Stars } from "~/components/stars";
import { relativeDate } from "~/lib/format";

export const meta: Route.MetaFunction = () => [
  { title: "ひとくち｜コンビニ新商品を、食べた人の口コミでチェック" },
  { name: "description", content: "セブン・ファミマ・ローソンなどコンビニの新商品を、実際に食べた人のリアルな口コミでチェック。買う前に、みんなの「ひとくち」を。" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const week = mondayOf(todayJst());
  await ensureBattles(db, week, addDays(week, 6));
  const user = await getUser(request, context.cloudflare.env);
  const voter = battleVoterKey(request, user?.id ?? null);
  const allBattles = await getBattles(db, week, voter.setCookie ? null : voter.key);
  // まだ投票していないジャンルを優先して 1 つ表示
  const battle = allBattles.find((b) => !b.mine) ?? allBattles[0] ?? null;
  const battleCount = allBattles.length;
  const battleVoted = allBattles.filter((b) => b.mine).length;
  const rec = user ? await recommendFor(db, user.id, 10) : null;
  // 管理画面で作った公開中の特集（商品が入っているものだけ）
  const seasonal = (await listCustomFeatures(db, true))
    .filter((f) => (f.item_count ?? 0) > 0)
    .map((f) => ({ slug: f.slug, title: f.title, lead: f.lead, emoji: f.emoji, gradient: themeGradient(f.theme) }));
  const [fresh, ranking, reviewRows, categories, weekItems] = await Promise.all([
    listProducts(db, { sort: "new", limit: 10 }),
    listProducts(db, { sort: "rating", limit: 10 }),
    latestReviews(db, 8),
    listCategories(db),
    weekProducts(db, week),
  ]);
  // レビュアー ID はクライアントに渡さない
  const reviews = reviewRows.map((row) => publicReview(row, null));
  const chainCounts = CHAIN_ORDER.map((c) => ({ ...c, n: weekItems.filter((p) => p.channels?.split(",").includes(c.slug)).length }));
  return { fresh, ranking, reviews, categories, week, weekCount: weekItems.length, chainCounts, weekThumbs: weekItems.filter((p) => p.image_url).slice(0, 4), battle, battleCount, battleVoted, rec, seasonal, nickname: user?.nickname ?? null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { fresh, ranking, reviews, categories, week, weekCount, chainCounts, weekThumbs, battle, battleCount, battleVoted, rec, seasonal, nickname } = loaderData;
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* あいさつ */}
      <section className="flex items-center gap-4 pb-2 pt-3 md:pb-6 md:pt-10">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-brand-600">{nickname ? `こんにちは、${nickname}さん` : "毎朝、コンビニの新商品をお届け"}</p>
          <h1 className="mt-1 font-display text-2xl font-black leading-tight md:text-5xl">
            買う前に、
            <br className="md:hidden" />
            みんなの<span className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">ひとくち</span>。
          </h1>
          <p className="mt-2 hidden text-stone-600 md:block dark:text-stone-400">コンビニの新作を、食べた人のリアルな口コミでチェック。あなたのひとことが、次のだれかの「おいしい」になる。</p>
        </div>
        <span className="logo-bob shrink-0 drop-shadow-[0_8px_14px_rgba(240,138,75,.35)]">
          <LogoMark size={64} className="md:h-24 md:w-24" />
        </span>
      </section>

      {/* チェーン（ストーリー風） */}
      <section aria-label="チェーンから探す" className="shelf -mx-4 flex gap-4 overflow-x-auto px-4 py-3 md:mx-0 md:justify-start md:px-0">
        <StoryLink to={`/weekly/${week}`} label="今週まとめ" ring="#f97316" bg="#fde7d3">
          <span className="text-2xl">🗓️</span>
        </StoryLink>
        {chainCounts.map((c) => (
          <StoryLink key={c.slug} to={`/products?channel=${c.slug}&sort=new`} label={c.name.replace("ファミリーマート", "ファミマ").replace("セブン-イレブン", "セブン").replace("デイリーヤマザキ", "デイリー").replace("ミニストップ", "ミニスト")} ring={c.color} bg={`${c.color}22`} badge={c.n || undefined}>
            <span className="text-[13px] font-black" style={{ color: c.color }}>{c.name.slice(0, 1)}</span>
          </StoryLink>
        ))}
        <StoryLink to="/features" label="特集" ring="#a855f7" bg="#f3e8ff">
          <span className="text-2xl">✨</span>
        </StoryLink>
      </section>

      {/* 今週の新商品 */}
      <Link
        to={`/weekly/${week}`}
        className="mt-2 flex items-center gap-4 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-5 text-white shadow-lg shadow-orange-500/25 transition active:scale-[.99] md:p-8"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold opacity-90">今週の新商品（{shortWeekLabel(week, addDays(week, 6))}）</p>
          <p className="mt-1 font-display text-2xl font-black md:text-4xl">{weekCount}品 ぜんぶ見る</p>
          <p className="mt-1 text-xs opacity-90">チェーン別のまとめ・新商品バトルもこちら</p>
        </div>
        <div className="flex -space-x-5">
          {weekThumbs.map((p, i) => (
            <img key={p.id} src={p.image_url!} alt="" referrerPolicy="no-referrer" loading="lazy" className={`h-16 w-16 rounded-2xl bg-white object-contain p-1 shadow-md ring-2 ring-white/70 md:h-24 md:w-24 ${i > 1 ? "hidden sm:block" : ""}`} />
          ))}
        </div>
      </Link>

      {rec && rec.items.length > 0 && (
        <Shelf title={rec.personalized ? "あなたへのおすすめ" : "まずはこちらから"} sub={rec.personalized ? "気になる・口コミの傾向から" : "気になるや口コミが増えるほど、あなた好みに"}>
          {rec.items.map((p, i) => (
            <ShelfItem key={p.id}><ProductCard p={p} index={i} /></ShelfItem>
          ))}
        </Shelf>
      )}

      <Shelf title="新着の新商品" to="/products?sort=new">
        {fresh.map((p, i) => (
          <ShelfItem key={p.id}><ProductCard p={p} index={i} /></ShelfItem>
        ))}
      </Shelf>

      {battle && (
        <section className="mt-8">
          <SectionTitle title="今週の新商品バトル" sub={`${battleCount}ジャンルで対戦中・あなたの投票 ${battleVoted}/${battleCount}`} to={`/weekly/${week}#battles`} />
          <div className="md:max-w-xl">
            <BattleCard key={battle.id} battle={battle} />
          </div>
          {battleCount > 1 && (
            <Link to={`/weekly/${week}#battles`} className="mt-3 block rounded-2xl bg-white py-3 text-center text-sm font-bold text-brand-600 ring-1 ring-cream-200 md:max-w-xl dark:bg-stone-900 dark:ring-white/10">
              全{battleCount}ジャンルのバトルを見る →
            </Link>
          )}
        </section>
      )}

      <AdSlot className="mt-8" format="horizontal" />

      <Shelf title="評価が高い商品" to="/products?sort=rating">
        {ranking.map((p, i) => (
          <ShelfItem key={p.id}><ProductCard p={p} rank={i + 1} index={i} /></ShelfItem>
        ))}
      </Shelf>

      {(
        <section className="mt-8">
          <SectionTitle title="特集" to="/features" />
          <div className="shelf -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {seasonal.map((s) => (
              <Link key={s.slug} to={`/features/${s.slug}`} className={`w-60 shrink-0 snap-start rounded-[1.5rem] bg-gradient-to-br ${s.gradient} p-5 text-white transition active:scale-[.98]`}>
                <p className="text-3xl">{s.emoji}</p>
                <p className="mt-2 font-display text-lg font-black">{s.title}</p>
                <p className="mt-1 line-clamp-2 text-xs opacity-90">{s.lead}</p>
              </Link>
            ))}
            <Link to="/features" className="grid w-44 shrink-0 snap-start place-items-center rounded-[1.5rem] bg-white p-5 text-center ring-1 ring-cream-200 dark:bg-stone-900 dark:ring-white/10">
              <span><span className="block text-3xl">🗾</span><span className="mt-2 block text-sm font-bold">地域限定</span><span className="text-xs text-stone-500">エリア別に見る →</span></span>
            </Link>
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="mt-8">
          <SectionTitle title="新着の口コミ" />
          <div className="shelf -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
            {reviews.map((r) => (
              <Link
                key={r.id}
                to={`/products/${r.product_id}`}
                className={`flex w-64 shrink-0 snap-start flex-col rounded-[1.5rem] bg-white p-4 ring-1 ring-cream-200 transition active:scale-[.98] md:w-auto dark:bg-stone-900 dark:ring-white/10 ${tierCardClass(r.reviewer)}`}
              >
                <div className="flex items-center gap-2.5">
                  <ReviewerAvatar nickname={r.nickname} stats={r.reviewer} size={34} src={r.author.avatarUrl} />
                  <ReviewerName nickname={r.nickname} stats={r.reviewer} showStats={false} ageGroup={r.author.ageGroup} gender={r.author.gender} isDemo={r.author.isDemo} />
                </div>
                <p className="mt-3 truncate text-xs font-bold text-stone-500">{r.category_emoji} {r.product_name}</p>
                <Stars value={r.rating} />
                <p className="mt-1 line-clamp-3 text-sm text-stone-700 dark:text-stone-300">{r.title ? `${r.title}。` : ""}{r.body || "（ひとこと口コミ）"}</p>
                <p className="mt-auto pt-3 text-[11px] text-stone-400">{relativeDate(r.created_at)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* カテゴリ */}
      <section className="mt-8">
        <SectionTitle title="カテゴリから探す" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-9">
          {categories.map((c) => (
            <Link key={c.id} to={`/products?category=${c.slug}`} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-xs font-bold ring-1 ring-cream-200 transition active:scale-95 dark:bg-stone-900 dark:ring-white/10">
              <span className="text-2xl">{c.emoji}</span>
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StoryLink({ to, label, ring, bg, badge, children }: { to: string; label: string; ring: string; bg: string; badge?: number; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center transition active:scale-95">
      <span className="relative grid h-16 w-16 place-items-center rounded-full p-[3px]" style={{ background: ring }}>
        <span className="grid h-full w-full place-items-center rounded-full border-2 border-cream bg-white dark:border-stone-950" style={{ backgroundImage: `linear-gradient(${bg}, ${bg})` }}>
          {children}
        </span>
        {badge != null && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-stone-900 px-1 text-[10px] font-bold text-white ring-2 ring-cream dark:bg-white dark:text-stone-900 dark:ring-stone-950">{badge}</span>}
      </span>
      <span className="w-full truncate text-[11px] font-bold text-stone-600 dark:text-stone-300">{label}</span>
    </Link>
  );
}

function SectionTitle({ title, sub, to }: { title: string; sub?: string; to?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-black md:text-2xl">{title}</h2>
        {sub && <p className="text-xs text-stone-500">{sub}</p>}
      </div>
      {to && (
        <Link to={to} className="shrink-0 text-sm font-bold text-brand-600">
          すべて →
        </Link>
      )}
    </div>
  );
}

function Shelf({ title, sub, to, children }: { title: string; sub?: string; to?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <SectionTitle title={title} sub={sub} to={to} />
      <div className="shelf -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-5">{children}</div>
    </section>
  );
}

function ShelfItem({ children }: { children: React.ReactNode }) {
  return <div className="w-40 shrink-0 snap-start sm:w-48 md:w-auto">{children}</div>;
}
