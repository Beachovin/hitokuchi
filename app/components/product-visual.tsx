import { useEffect, useRef, useState } from "react";
import { imgUrl } from "~/lib/format";

/**
 * 商品画像。収集元サイトの画像 URL をそのまま埋め込む（自サイトには保存しない）。
 * 画像が無い・読み込めない場合は、アクセントカラーのグラデーション＋カテゴリ絵文字で表示。
 */
export function ProductVisual({
  imageUrl,
  imageKey,
  accent,
  emoji,
  name,
  className = "",
  big = false,
}: {
  imageUrl?: string | null;
  imageKey?: string | null; // 旧データ（R2）互換
  accent: string;
  emoji: string | null;
  name: string;
  className?: string;
  big?: boolean;
}) {
  const src = imageUrl || imgUrl(imageKey ?? null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // SSR 中に読み込み失敗した画像は onError が発火しないので、ハイドレーション後に確認する
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (src && !failed) {
    return (
      <div className={`relative overflow-hidden bg-white ${className}`}>
        <img
          ref={ref}
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-[6%]"
        />
      </div>
    );
  }
  return (
    <div
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(120% 90% at 20% 10%, ${accent}55, transparent 60%), linear-gradient(135deg, ${accent}33, ${accent}99)` }}
      role="img"
      aria-label={name}
    >
      <div className="absolute -right-6 -bottom-8 h-32 w-32 rounded-full bg-white/25 blur-2xl" />
      <span className={`${big ? "text-[8rem]" : "text-6xl"} select-none drop-shadow-[0_8px_16px_rgba(0,0,0,.18)]`}>{emoji ?? "🍽️"}</span>
    </div>
  );
}
