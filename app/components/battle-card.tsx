import { useState } from "react";
import { Link, useFetcher } from "react-router";
import type { Battle } from "~/lib/battles.server";

/**
 * 新商品バトル。片方を選ぶと「本当にこちらでいいですか？」と確認し、確定すると投票。
 * 投票は 1 回だけで、投票後はもう一方を選べない。closed なら結果のみ表示。
 */
export function BattleCard({ battle, closed = false }: { battle: Battle; closed?: boolean }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [picking, setPicking] = useState<"a" | "b" | null>(null);
  const submitted = fetcher.formData?.get("choice") as "a" | "b" | undefined;
  const mine = battle.mine ?? (fetcher.data?.ok || fetcher.state !== "idle" ? submitted ?? null : null);
  // 楽観的更新
  let a = battle.a.votes;
  let b = battle.b.votes;
  if (!battle.mine && mine) mine === "a" ? a++ : b++;
  const total = a + b;
  const locked = closed || !!mine;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const winner = closed && total ? (a === b ? null : a > b ? "a" : "b") : null;
  const side = (k: "a" | "b") => (k === "a" ? battle.a : battle.b);

  const Side = ({ k, votes }: { k: "a" | "b"; votes: number }) => {
    const s = side(k);
    const chosen = mine === k;
    const selecting = picking === k;
    const dim = (mine && !chosen) || (picking && !selecting);
    const content = (
      <>
        <div
          className={`relative aspect-square overflow-hidden rounded-2xl bg-white ring-2 transition ${
            chosen ? "ring-brand-500" : selecting ? "ring-amber-400 ring-offset-2" : winner === k ? "ring-amber-400" : "ring-transparent"
          } ${dim ? "opacity-50 grayscale-[40%]" : ""}`}
        >
          {s.image_url ? (
            <img src={s.image_url} alt={s.name} referrerPolicy="no-referrer" loading="lazy" className={`h-full w-full object-contain p-[8%] transition duration-300 ${locked ? "" : "group-hover:scale-105"}`} />
          ) : (
            <span className="grid h-full place-items-center text-5xl">🍙</span>
          )}
          {winner === k && <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">👑 WIN</span>}
          {chosen && !closed && <span className="absolute left-2 top-2 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-black text-white">あなたの1票</span>}
        </div>
        <p className="mt-2 text-[11px] text-stone-500">{s.maker}</p>
        <p className="line-clamp-2 text-sm font-bold leading-snug">{s.name}</p>
        {locked && (
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
              <div className={`h-full rounded-full transition-all duration-700 ${k === "a" ? "bg-gradient-to-r from-brand-400 to-rose-500" : "bg-gradient-to-r from-sky-400 to-indigo-500"}`} style={{ width: `${pct(votes)}%` }} />
            </div>
            <p className="mt-1 text-xs font-bold tabular-nums">{pct(votes)}%</p>
          </div>
        )}
      </>
    );
    if (closed) return <Link to={`/products/${s.id}`} className="group block">{content}</Link>;
    if (locked) return <div className="block cursor-default">{content}</div>;
    return (
      <button type="button" onClick={() => setPicking(k)} className="group block w-full text-left" aria-pressed={selecting} title={`「${s.name}」を選ぶ`}>
        {content}
      </button>
    );
  };

  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-stone-200/70 dark:bg-stone-900 dark:ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-black">{battle.genre?.emoji ?? "⚔️"} {battle.theme}</p>
        <p className="text-xs text-stone-400">{total}票</p>
      </div>
      <div className="relative grid grid-cols-2 gap-4">
        <Side k="a" votes={a} />
        <Side k="b" votes={b} />
        <span className="pointer-events-none absolute left-1/2 top-[38%] grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-stone-900 text-xs font-black text-white shadow-lg ring-4 ring-white dark:bg-white dark:text-stone-900 dark:ring-stone-900">
          VS
        </span>
      </div>

      {/* 確認 */}
      {picking && !locked && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-center ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30" role="alertdialog" aria-label="投票の確認">
          <p className="text-sm">
            「<strong>{side(picking).name}</strong>」に投票します。
            <br />
            本当にこちらでいいですか？
          </p>
          <p className="mt-1 text-[11px] text-stone-500">投票はあとから変更できません</p>
          <fetcher.Form method="post" action="/api/battle" className="mt-3 flex justify-center gap-2" onSubmit={() => setPicking(null)}>
            <input type="hidden" name="battleId" value={battle.id} />
            <input type="hidden" name="choice" value={picking} />
            <button type="button" onClick={() => setPicking(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-stone-300 hover:bg-white dark:ring-white/20 dark:hover:bg-white/10">
              やめる
            </button>
            <button autoFocus className="rounded-full bg-brand-500 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-brand-600">
              この商品に投票する
            </button>
          </fetcher.Form>
        </div>
      )}

      {!picking && !locked && <p className="mt-3 text-center text-xs text-stone-500">気になる方をタップして投票（ログイン不要・1回のみ）</p>}
      {fetcher.data && !fetcher.data.ok && <p className="mt-3 text-center text-xs text-rose-600">{fetcher.data.error}</p>}
      {mine && !closed && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-stone-500">投票ありがとうございました！</span>
          <Link to={`/products/${side(mine).id}`} className="font-semibold text-brand-600 hover:underline">選んだ商品を見る →</Link>
        </div>
      )}
    </div>
  );
}
