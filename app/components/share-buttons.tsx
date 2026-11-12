import { useState } from "react";

/** SNS シェアボタン（X / LINE / リンクコピー）。外部スクリプトは読み込まない */
export function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const base = "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`https://x.com/intent/post?text=${t}&url=${u}`} target="_blank" rel="noopener" className={`${base} bg-stone-900 text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900`}>
        𝕏 ポスト
      </a>
      <a href={`https://social-plugins.line.me/lineit/share?url=${u}`} target="_blank" rel="noopener" className={`${base} bg-[#06c755] text-white hover:brightness-105`}>
        LINEで送る
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {}
        }}
        className={`${base} ring-1 ring-stone-300 hover:bg-stone-100 dark:ring-white/15 dark:hover:bg-white/10`}
      >
        {copied ? "✓ コピーしました" : "🔗 リンクをコピー"}
      </button>
    </div>
  );
}
