import { Form, Link, useNavigation, useSearchParams, useSubmit } from "react-router";
import type { Route } from "./+types/products";
import { listCategories, listChannels, listProducts, type ProductQuery } from "~/lib/db.server";
import { ProductCard } from "~/components/product-card";
import { AdSlot } from "~/components/ad-slot";
import { Fragment, useEffect, useRef } from "react";

const PAGE = 24;
const SORTS = [
  ["new", "新着順"],
  ["rating", "評価が高い順"],
  ["reviews", "口コミが多い順"],
  ["price_asc", "価格が安い順"],
] as const;

export const meta: Route.MetaFunction = ({ data }) => [{ title: `${data?.heading ?? "商品一覧"}｜ひとくち` }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const sortParam = url.searchParams.get("sort");
  const sort = (SORTS.some(([k]) => k === sortParam) ? sortParam : "new") as ProductQuery["sort"];
  const q = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const channel = url.searchParams.get("channel") ?? "";
  const [products, categories, channels] = await Promise.all([
    listProducts(db, { q, category, channel, sort, limit: PAGE * page + 1 }),
    listCategories(db),
    listChannels(db),
  ]);
  const cat = categories.find((c) => c.slug === category);
  const heading = q ? `「${q}」の検索結果` : cat ? `${cat.emoji} ${cat.name}` : sort === "rating" ? "ランキング" : "新商品";
  return {
    products: products.slice(0, PAGE * page),
    hasMore: products.length > PAGE * page,
    page,
    categories,
    channels,
    heading,
  };
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { products, hasMore, page, categories, channels, heading } = loaderData;
  const [params] = useSearchParams();
  const submit = useSubmit();
  const nav = useNavigation();
  // ヘッダーの検索ボタン（?focus=1）から来たら検索欄にフォーカス（SSR では autoFocus が効かないため）
  const searchRef = useRef<HTMLInputElement>(null);
  const wantFocus = params.has("focus");
  useEffect(() => {
    if (wantFocus) searchRef.current?.focus();
  }, [wantFocus]);
  const withParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (k !== "page") p.delete("page"); // 絞り込み・並び替えを変えたら 1 ページ目に戻す
    if (v) p.set(k, v);
    else p.delete(k);
    return `?${p}`;
  };
  const current = params.get("category");
  return (
    <div className="mx-auto max-w-6xl px-4 pt-3 md:pt-10">
      {/* スマホ：検索欄（ヘッダーの検索ボタンから来たら自動でフォーカス） */}
      <Form action="/products" className="relative mb-4 md:hidden">
        <input
          name="q"
          defaultValue={params.get("q") ?? ""}
          ref={searchRef}
          placeholder="商品名・メーカーで検索"
          aria-label="検索"
          enterKeyHint="search"
          className="w-full rounded-2xl bg-white py-3 pl-11 pr-4 shadow-sm outline-none ring-1 ring-cream-200 focus:ring-2 focus:ring-brand-400 dark:bg-stone-900 dark:ring-white/10"
        />
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </Form>
      <h1 className="font-display text-2xl font-black sm:text-4xl">{heading}</h1>

      {/* Category chips */}
      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        <Chip to={withParam("category", null)} active={!current}>
          すべて
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} to={withParam("category", c.slug)} active={current === c.slug}>
            {c.emoji} {c.name}
          </Chip>
        ))}
      </div>

      <Form className="mt-4 flex flex-wrap items-center gap-3" onChange={(e) => submit(e.currentTarget)}>
        {params.get("q") && <input type="hidden" name="q" value={params.get("q")!} />}
        {current && <input type="hidden" name="category" value={current} />}
        <Select name="channel" defaultValue={params.get("channel") ?? ""} label="販売チャネル">
          <option value="">すべての販売店</option>
          {channels.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={params.get("sort") ?? "new"} label="並び順">
          {SORTS.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-sm text-stone-500">{products.length}{hasMore ? "+" : ""} 件</span>
      </Form>

      <div className={`mt-5 grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3 lg:grid-cols-4 transition-opacity ${nav.state === "loading" ? "opacity-60" : ""}`}>
        {products.map((p, i) => (
          <Fragment key={p.id}>
            <ProductCard p={p} index={i % 24} />
            {/* 12 件ごとに広告枠（1 行分） */}
            {(i + 1) % 12 === 0 && i + 1 < products.length && <AdSlot className="col-span-full my-2" format="horizontal" />}
          </Fragment>
        ))}
      </div>

      {products.length === 0 && (
        <div className="mt-16 text-center text-stone-500">
          <p className="text-5xl">🔍</p>
          <p className="mt-3">該当する商品が見つかりませんでした。</p>
        </div>
      )}

      {hasMore && (
        <div className="mt-10 text-center">
          <Link
            to={withParam("page", String(page + 1))}
            preventScrollReset
            className="inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900"
          >
            もっと見る
          </Link>
        </div>
      )}
    </div>
  );
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-stone-900 text-white shadow-md dark:bg-white dark:text-stone-900"
          : "bg-white ring-1 ring-stone-200 hover:ring-stone-300 dark:bg-stone-900 dark:ring-white/10"
      }`}
    >
      {children}
    </Link>
  );
}

function Select({ label, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <select
      aria-label={label}
      {...rest}
      className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-brand-400 dark:bg-stone-900 dark:ring-white/10"
    >
      {children}
    </select>
  );
}
