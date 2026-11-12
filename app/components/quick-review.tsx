import { useState } from "react";
import { useFetcher } from "react-router";

const WORDS = ["", "いまいち", "ふつう", "まあまあ", "おいしい", "最高！"];

/** 星をタップしてひとこと添えるだけの口コミ */
export function QuickReview({
  state,
  loginHref,
  setupHref,
  firstChance,
}: {
  state: "anon" | "setup" | "ready" | "done";
  loginHref: string;
  setupHref: string;
  firstChance: boolean;
}) {
  const fetcher = useFetcher<{ ok: boolean; first?: boolean; errors?: Record<string, string> }>();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const done = state === "done" || fetcher.data?.ok;
  const shown = hover || rating;

  return (
    <section id="quick" className="mt-6 scroll-mt-24 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 to-rose-50 p-5 ring-1 ring-amber-200/60 dark:from-amber-500/[0.07] dark:to-rose-500/[0.07] dark:ring-amber-400/20">
      {firstChance && !done && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 text-xs font-black text-amber-950 shadow-sm">
          🥇 まだ口コミがありません！一番乗りでファーストレビュー +5pt
        </p>
      )}
      {done ? (
        <div className="text-center">
          <p className="text-2xl">{fetcher.data?.first ? "🥇" : "🙌"}</p>
          <p className="mt-1 font-bold">{fetcher.data?.first ? "ファーストレビュー獲得！ +5pt" : "口コミありがとうございます！"}</p>
          <p className="mt-1 text-xs text-stone-500">マイページで投稿した口コミを確認できます</p>
        </div>
      ) : (
        <fetcher.Form method="post">
          <p className="font-bold">食べた？ 星をタップしてひとこと口コミ</p>
          <input type="hidden" name="quick" value="1" />
          <input type="hidden" name="rating" value={rating || ""} />
          <div className="mt-3 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type={state === "ready" ? "button" : "button"}
                onMouseEnter={() => setHover(n)}
                onClick={() => {
                  if (state === "anon") return void (window.location.href = loginHref);
                  if (state === "setup") return void (window.location.href = setupHref);
                  setRating(n);
                }}
                aria-label={`${n}点`}
                className="transition active:scale-90"
              >
                <svg width="34" height="34" viewBox="0 0 24 24" className={n <= shown ? "scale-110 text-amber-400 transition" : "text-stone-300 transition dark:text-stone-600"} aria-hidden>
                  <path fill="currentColor" d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3 5.9 20.7l1.5-6.7L2.3 9.4l6.8-.7z" />
                </svg>
              </button>
            ))}
            <span className="ml-2 text-sm font-bold text-amber-600">{WORDS[shown]}</span>
          </div>
          {rating > 0 && (
            <div className="mt-3 flex gap-2">
              <input name="body" maxLength={60} autoFocus placeholder="ひとこと（任意・60字まで）" className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2.5 text-sm outline-none ring-1 ring-amber-200 focus:ring-2 focus:ring-amber-400 dark:bg-stone-900 dark:ring-white/10" />
              <button disabled={fetcher.state !== "idle"} className="shrink-0 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-stone-900">
                投稿
              </button>
            </div>
          )}
          {fetcher.data?.errors && <p className="mt-2 text-sm text-rose-600">{Object.values(fetcher.data.errors)[0]}</p>}
          {state === "anon" && <p className="mt-2 text-xs text-stone-500">星をタップするとログイン画面に移動します</p>}
        </fetcher.Form>
      )}
    </section>
  );
}
