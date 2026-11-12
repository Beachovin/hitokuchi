import { useEffect, useState } from "react";
import { safeGet, safeSet } from "~/lib/client-storage";
import { WELCOME_SEEN_KEY } from "~/lib/welcome";

/**
 * PWA：Service Worker の登録・更新のお知らせ・ホーム画面への追加の案内
 * 本番ビルドでだけ登録する（開発中のホットリロードを邪魔しないため）。
 */
export function PwaManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // 既に新しい版が待機中
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
          });
        });
        // タブを開きっぱなしの人にも更新が届くよう 1 時間ごとに確認
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      } catch {
        // 登録に失敗しても通常のサイトとしてそのまま動く
      }
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return (
    <>
      {waiting && (
        <div role="status" className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-xl md:bottom-6">
          <span className="flex-1">新しいバージョンがあります</span>
          <button onClick={() => waiting.postMessage("SKIP_WAITING")} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-stone-900">
            更新する
          </button>
        </div>
      )}
      <InstallPrompt />
    </>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "hk_install_dismissed_at";
const VIEWS_KEY = "hk_page_views";


/** ホーム画面への追加の案内（スマホ・ブラウザ表示中・2 ページ目以降・閉じたら 30 日表示しない） */
function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"android" | "ios" | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (standalone || !mobile) return;
    // ようこそガイドをまだ閉じていない人には、ガイドと重ならないよう出さない
    if (!safeGet(window.localStorage, WELCOME_SEEN_KEY)) return;
    const dismissed = Number(safeGet(window.localStorage, DISMISS_KEY) ?? 0);
    if (Date.now() - dismissed < 30 * 86400_000) return;
    const views = Number(safeGet(window.sessionStorage, VIEWS_KEY) ?? 0) + 1;
    safeSet(window.sessionStorage, VIEWS_KEY, String(views));
    if (views < 2) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iPhone / iPad の Safari は beforeinstallprompt が無いので手順を案内
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Line\//.test(ua);
    if (ios) setMode("ios");
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!mode) return null;
  const close = () => {
    safeSet(window.localStorage, DISMISS_KEY, String(Date.now()));
    setMode(null);
  };
  return (
    <div role="dialog" aria-label="ホーム画面に追加" className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[55] mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-white p-3 pr-2 shadow-xl ring-1 ring-cream-200 md:hidden dark:bg-stone-900 dark:ring-white/10">
      <img src="/icons/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <p className="font-bold text-stone-900 dark:text-white">ホーム画面に追加</p>
        {mode === "android" ? (
          <p className="text-stone-500">アプリのように、すぐ開けます</p>
        ) : (
          <p className="text-stone-500">
            下の <span aria-label="共有">共有ボタン</span> から「ホーム画面に追加」を選んでください
          </p>
        )}
      </div>
      {mode === "android" && deferred && (
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => null);
            setDeferred(null);
            setMode(null);
          }}
          className="shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-brand-500 px-3 py-2 text-xs font-bold text-white"
        >
          追加する
        </button>
      )}
      <button onClick={close} aria-label="閉じる" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-cream">
        ×
      </button>
    </div>
  );
}
