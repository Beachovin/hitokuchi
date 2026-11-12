import { useState } from "react";
import type { Battle } from "~/lib/battles.server";
import { BattleCard } from "./battle-card";

/** ジャンルごとの新商品バトル一覧（ジャンルで絞り込み） */
export function BattleBoard({ battles, closed = false }: { battles: Battle[]; closed?: boolean }) {
  const [genre, setGenre] = useState<string | null>(null);
  const genres = battles.map((b) => b.genre).filter((g): g is NonNullable<Battle["genre"]> => !!g);
  const shown = genre ? battles.filter((b) => b.genre?.slug === genre) : battles;
  const voted = battles.filter((b) => b.mine).length;
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${active ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "bg-white ring-1 ring-cream-200 dark:bg-stone-900 dark:ring-white/10"}`;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="shelf -mx-4 flex flex-1 gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist" aria-label="ジャンル">
          <button type="button" role="tab" aria-selected={!genre} onClick={() => setGenre(null)} className={chip(!genre)}>
            すべて {battles.length}
          </button>
          {genres.map((g) => (
            <button key={g.slug} type="button" role="tab" aria-selected={genre === g.slug} onClick={() => setGenre(g.slug)} className={chip(genre === g.slug)}>
              {g.emoji} {g.name}
            </button>
          ))}
        </div>
        {!closed && (
          <p className="text-xs font-bold text-stone-500">
            投票済み <span className="text-brand-600">{voted}</span> / {battles.length}
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((b) => (
          <BattleCard key={b.id} battle={b} closed={closed} />
        ))}
      </div>
    </div>
  );
}
