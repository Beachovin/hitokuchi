import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { isbot } from "isbot";
import { safeGet, safeSet } from "~/lib/client-storage";
import { OPEN_WELCOME_EVENT, WELCOME_SEEN_KEY, WELCOME_STEPS, welcomeMode, type WelcomeMode } from "~/lib/welcome";
import { LogoMark } from "./logo";

/** 「使い方を見る」などのボタンからガイドを開く */
export function openWelcome() {
  window.dispatchEvent(new Event(OPEN_WELCOME_EVENT));
}

/**
 * はじめて来た人向けの案内。表示はブラウザ側だけで判定する（サーバーが返す HTML には含めない＝検索エンジンには影響しない）。
 * 閉じたら、その端末では二度と自動では出さない。
 */
export function WelcomeGuide({ loggedIn }: { loggedIn: boolean }) {
  const { pathname } = useLocation();
  const [mode, setMode] = useState<WelcomeMode>(null);
  // 最初に開いたページでだけ判定する（ページを移動するたびに出し直さない）
  const first = useRef({ pathname, loggedIn });

  useEffect(() => {
    const { pathname: path, loggedIn: li } = first.current;
    const m = welcomeMode({ pathname: path, seen: !!safeGet(window.localStorage, WELCOME_SEEN_KEY), loggedIn: li, bot: isbot(navigator.userAgent) });
    if (!m) return;
    // ページが表示されてから少し待って出す（いきなり覆いかぶさらないように）
    const t = window.setTimeout(() => setMode(m), m === "modal" ? 500 : 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const open = () => setMode("modal");
    window.addEventListener(OPEN_WELCOME_EVENT, open);
    return () => window.removeEventListener(OPEN_WELCOME_EVENT, open);
  }, []);

  const close = useCallback(() => {
    safeSet(window.localStorage, WELCOME_SEEN_KEY, new Date().toISOString());
    setMode(null);
  }, []);

  if (mode === "banner") return <WelcomeBanner onOpen={() => setMode("modal")} onClose={close} />;
  if (mode === "modal") return <WelcomeModal loggedIn={loggedIn} onClose={close} />;
  return null;
}

/** 商品ページなどに直接来た人向けの小さな案内（読みたい内容を隠さない） */
function WelcomeBanner({ onOpen, onClose }: { onOpen: () => void; onClose: () => void }) {
  return (
    <div
      role="region"
      aria-label="はじめての方へ"
      className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[56] mx-auto flex max-w-md animate-[rise_.35s_ease-out] items-center gap-3 rounded-3xl bg-white p-3 pr-2 shadow-xl ring-1 ring-cream-200 md:bottom-6 dark:bg-stone-900 dark:ring-white/10"
    >
      <LogoMark size={40} className="shrink-0" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left text-xs leading-relaxed">
        <span className="block font-bold text-stone-900 dark:text-white">はじめての方へ</span>
        <span className="text-stone-500">ひとくちは、コンビニ新商品の口コミサイトです。<span className="font-semibold text-brand-600">使い方を見る →</span></span>
      </button>
      <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-cream-200/60 dark:hover:bg-white/10" aria-label="閉じる">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}

/** トップに初めて来た人向けの、3 ページのガイド */
function WelcomeModal({ loggedIn, onClose }: { loggedIn: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const last = step === WELCOME_STEPS.length - 1;
  const s = WELCOME_STEPS[step];

  useEffect(() => {
    panel.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 後ろのページがスクロールしないように
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowRight" && !last) setStep(step + 1);
    else if (e.key === "ArrowLeft" && step > 0) setStep(step - 1);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-stone-950/45 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md animate-[rise_.35s_ease-out] rounded-t-[2rem] bg-white px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-2xl outline-none sm:rounded-[2rem] sm:pb-6 dark:bg-stone-900"
      >
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full px-3 py-1.5 text-xs font-bold text-stone-400 hover:bg-cream-200/60 hover:text-stone-600 dark:hover:bg-white/10">
          スキップ
        </button>

        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-amber-100 to-brand-100 text-4xl dark:from-amber-500/15 dark:to-brand-500/15">
          {step === 0 ? <LogoMark size={56} /> : <span aria-hidden>{s.emoji}</span>}
        </div>
        <h2 id="welcome-title" className="mt-5 font-display text-2xl font-black text-stone-900 dark:text-white">{s.title}</h2>
        {s.body && <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{s.body}</p>}
        {s.points.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {s.points.map((p) => (
              <li key={p.text} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5 text-sm font-semibold text-stone-700 dark:bg-white/5 dark:text-stone-200">
                <span className="text-xl" aria-hidden>{p.icon}</span>
                {p.text}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center gap-1.5" aria-label={`${step + 1} / ${WELCOME_STEPS.length}`}>
          {WELCOME_STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`${i + 1}ページ目`}
              aria-current={i === step ? "step" : undefined}
              className={`h-2 rounded-full transition-all ${i === step ? "w-6 bg-brand-500" : "w-2 bg-stone-200 dark:bg-white/15"}`}
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className="rounded-2xl px-4 py-3 text-sm font-bold text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50 dark:ring-white/10 dark:hover:bg-white/5">
              もどる
            </button>
          )}
          {!last ? (
            <button type="button" onClick={() => setStep(step + 1)} className="flex-1 rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900">
              つぎへ
            </button>
          ) : (
            <>
              {!loggedIn && (
                <Link to="/login" onClick={onClose} className="rounded-2xl px-4 py-3 text-sm font-bold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50 dark:text-stone-200 dark:ring-white/10 dark:hover:bg-white/5">
                  ログイン
                </Link>
              )}
              <button type="button" onClick={onClose} className="flex-1 rounded-2xl bg-gradient-to-br from-amber-400 to-brand-500 py-3 text-sm font-bold text-white shadow-sm shadow-brand-500/30 hover:brightness-105">
                さっそく見てみる
              </button>
            </>
          )}
        </div>
        {last && (
          <p className="mt-4 text-center text-xs text-stone-400">
            <Link to="/about" onClick={onClose} className="underline">ひとくちについて詳しく</Link>
          </p>
        )}
      </div>
    </div>
  );
}
