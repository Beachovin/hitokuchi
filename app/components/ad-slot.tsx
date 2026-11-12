import { useEffect, useRef, useState } from "react";
import { usePublicSettings } from "~/lib/monetize";
import { rakutenAdDocument, rakutenAdSize } from "~/lib/rakuten-ad";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * 広告枠。表示する広告は次の順で選ぶ。どれも無ければ何も表示しない。
 *   1. Google AdSense（広告を ON にし、クライアント ID と広告ユニット ID を設定済み）
 *   2. 楽天の画像広告（楽天の広告を ON にし、コードを設定済み）
 */
export function AdSlot({ className = "", format = "auto" }: { className?: string; format?: "auto" | "horizontal" | "rectangle" }) {
  const s = usePublicSettings();
  if (!s) return null;
  const adsense = s.ads_enabled && !!s.adsense_client && !!s.adsense_slot;
  const rakuten = s.rakuten_ads_enabled && !!(s.rakuten_ad_sp || s.rakuten_ad_pc);
  if (!adsense && !rakuten) return null;
  return (
    <aside className={`mx-auto w-full ${className}`} aria-label="広告">
      <p className="mb-1 text-center text-[10px] tracking-widest text-stone-400">広告</p>
      {adsense ? <AdSense client={s.adsense_client} slot={s.adsense_slot} format={format} /> : <RakutenAd sp={s.rakuten_ad_sp} pc={s.rakuten_ad_pc} />}
    </aside>
  );
}

function AdSense({ client, slot, format }: { client: string; slot: string; format: string }) {
  const pushed = useRef(false);
  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }, []);
  return <ins className="adsbygoogle block" style={{ display: "block" }} data-ad-client={client} data-ad-slot={slot} data-ad-format={format} data-full-width-responsive="true" />;
}

/**
 * 楽天の画像広告。/ad/rakuten/:slot のページを、サイト本体から切り離した iframe（sandbox・別オリジン扱い）で読み込むので、
 * 広告のスクリプトはサイトの Cookie やページの中身に触れない。
 * スマホ用・PC 用のコードを画面幅で切り替え、枠より大きい広告は縮小して収める。
 */
export function RakutenAd({ sp, pc, preview = false }: { sp: string; pc: string; preview?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<"sp" | "pc" | null>(null);
  const code = slot === "pc" ? pc || sp : slot === "sp" ? sp || pc : null;
  const [scale, setScale] = useState(1);

  // 画面幅で使うコードを決める（サーバー側の描画では出さない）
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const pick = () => setSlot(sp || pc ? (mq.matches ? "pc" : "sp") : null);
    pick();
    mq.addEventListener("change", pick);
    return () => mq.removeEventListener("change", pick);
  }, [sp, pc]);

  const size = code ? rakutenAdSize(code) : null;
  useEffect(() => {
    if (!size || !box.current) return;
    const fit = () => setScale(Math.min(1, (box.current?.clientWidth ?? size.width) / size.width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [size?.width]);

  return (
    <div ref={box} className="flex w-full justify-center overflow-hidden" style={{ height: size ? Math.ceil(size.height * scale) : 0 }}>
      {code && size && (
        <iframe
          title="楽天の広告"
          // 通常はサイト上の広告ページを読み込む（楽天のウィジェットはページの URL が必要）。管理画面のプレビューだけはその場のコードで表示
          {...(preview ? { srcDoc: rakutenAdDocument(code) } : { src: `/ad/rakuten/${slot}` })}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade"
          loading="lazy"
          scrolling="no"
          width={size.width}
          height={size.height}
          className="shrink-0 border-0"
          style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
        />
      )}
    </div>
  );
}
