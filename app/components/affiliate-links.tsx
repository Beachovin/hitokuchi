import { affiliateLinks, usePublicSettings } from "~/lib/monetize";

/** 通販リンク（アフィリエイト）。ステマ規制に沿って「PR」を明示する */
export function AffiliateLinks({ name, category }: { name: string; category: string | null }) {
  const s = usePublicSettings();
  // チェーン名は通販で検索しても意味がないので商品名だけで探す
  const links = affiliateLinks(s, name, category);
  if (!links.length) return null;
  return (
    <div className="mt-6 rounded-2xl bg-stone-100/70 p-4 dark:bg-white/5">
      <p className="mb-2 flex items-center gap-2 text-xs text-stone-500">
        <span className="rounded bg-stone-300/70 px-1.5 py-0.5 text-[10px] font-bold text-stone-600 dark:bg-white/15 dark:text-stone-300">PR</span>
        通販で探す（リンク先での購入により当サイトに収益が発生する場合があります）
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="sponsored noopener" className={`rounded-full px-4 py-2 text-sm font-semibold transition ${l.className}`}>
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
