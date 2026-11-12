import { Link } from "react-router";
import type { ProductRow } from "~/lib/db.server";
import { isNew, regionLabel, releaseLabel, yen } from "~/lib/format";
import { ProductVisual } from "./product-visual";
import { BookmarkButton } from "./bookmark-button";
import { Stars } from "./stars";

type CardProduct = Pick<
  ProductRow,
  "id" | "name" | "maker" | "category_emoji" | "price" | "image_key" | "image_url" | "region" | "accent" | "released_on" | "rating_avg" | "review_count"
>;

export function ProductCard({ p, rank, index = 0 }: { p: CardProduct; rank?: number; index?: number }) {
  return (
    <div className="group/card relative">
    <Link
      to={`/products/${p.id}`}
      prefetch="intent"
      className="card-lift rise group block overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-cream-200 transition active:scale-[.98] dark:bg-stone-900 dark:ring-white/10"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="relative">
        <ProductVisual
          imageUrl={p.image_url}
          imageKey={p.image_key}
          accent={p.accent}
          emoji={p.category_emoji}
          name={p.name}
          className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {rank != null && (
            <span className="grid h-8 w-8 place-items-center rounded-full bg-stone-900 text-sm font-bold text-white shadow-lg">
              {rank}
            </span>
          )}
          {isNew(p.released_on) && (
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold tracking-wide text-brand-600 shadow-sm">NEW</span>
          )}
        </div>
      </div>
      <div className="p-3 md:p-4">
        <p className="mb-0.5 truncate text-[11px] font-bold text-stone-400 md:text-xs">{p.maker ?? "メーカー不明"}</p>
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug md:min-h-[2.75rem] md:text-base">{p.name}</h3>
        <ReleaseRegion releasedOn={p.released_on} region={p.region} />
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Stars value={p.rating_avg} />
            <span className="text-sm font-semibold">{p.review_count ? p.rating_avg.toFixed(1) : "—"}</span>
            <span className="text-xs text-stone-400">({p.review_count})</span>
          </div>
          <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">{yen(p.price)}</span>
        </div>
      </div>
    </Link>
      <div className="absolute right-2 top-2 z-10 md:right-3 md:top-3">
        <BookmarkButton productId={p.id} />
      </div>
    </div>
  );
}

function ReleaseRegion({ releasedOn, region }: { releasedOn: string | null; region: string | null }) {
  const rel = releaseLabel(releasedOn);
  const reg = regionLabel(region);
  if (!rel && !reg) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-500 dark:text-stone-400">
      {rel && (
        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${rel.endsWith("予定") ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : "bg-stone-100 dark:bg-white/10"}`}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
          {rel}
        </span>
      )}
      {reg && (
        <span title={region ?? undefined} className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-stone-100 px-1.5 py-0.5 dark:bg-white/10">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          <span className="truncate">{reg}</span>
        </span>
      )}
    </div>
  );
}
