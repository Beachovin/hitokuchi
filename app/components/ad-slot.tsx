import { useEffect, useRef } from "react";
import { usePublicSettings } from "~/lib/monetize";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * 広告枠。設定で広告が OFF のときは何も表示しない。
 * AdSense の ID が未設定のときは、レイアウト確認用のプレースホルダーを表示する。
 */
export function AdSlot({ className = "", format = "auto" }: { className?: string; format?: "auto" | "horizontal" | "rectangle" }) {
  const s = usePublicSettings();
  const pushed = useRef(false);
  const live = !!(s?.ads_enabled && s.adsense_client && s.adsense_slot);

  useEffect(() => {
    if (!live || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, [live]);

  if (!s?.ads_enabled) return null;
  return (
    <aside className={`mx-auto w-full ${className}`} aria-label="広告">
      <p className="mb-1 text-center text-[10px] tracking-widest text-stone-400">広告</p>
      {live ? (
        <ins
          className="adsbygoogle block"
          style={{ display: "block" }}
          data-ad-client={s.adsense_client}
          data-ad-slot={s.adsense_slot}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      ) : (
        <div className="grid h-28 place-items-center rounded-2xl border-2 border-dashed border-stone-300 text-xs text-stone-400 dark:border-white/15">
          広告枠（AdSense のクライアント ID と広告ユニット ID を設定すると表示されます）
        </div>
      )}
    </aside>
  );
}
