import { useId } from "react";

/** ひとくちのロゴマーク：ふきだしの中に、にっこりおむすび（口コミ×おにぎり） */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="ひとくち">
      <defs>
        <clipPath id={`rice-${id}`}>
          <path d="M32 13c3 0 5 1.5 6.6 4l10 17.3c2.5 4.4-.2 10.7-6.2 11.2-3.4.3-6.9.5-10.4.5s-7-.2-10.4-.5c-6-.5-8.7-6.8-6.2-11.2l10-17.3C27 14.5 29 13 32 13z" />
        </clipPath>
      </defs>
      {/* ふきだし */}
      <path d="M14 6h36a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H26l-11 8 2-8h-3A10 10 0 0 1 4 42V16A10 10 0 0 1 14 6z" fill="#F08A4B" />
      {/* おむすび */}
      <path d="M32 13c3 0 5 1.5 6.6 4l10 17.3c2.5 4.4-.2 10.7-6.2 11.2-3.4.3-6.9.5-10.4.5s-7-.2-10.4-.5c-6-.5-8.7-6.8-6.2-11.2l10-17.3C27 14.5 29 13 32 13z" fill="#fff" />
      <g clipPath={`url(#rice-${id})`}>
        <rect x="23" y="36" width="18" height="12" rx="2" fill="#2F4A36" />
      </g>
      {/* お顔 */}
      <circle cx="27.5" cy="28" r="1.8" fill="#3B2A20" />
      <circle cx="36.5" cy="28" r="1.8" fill="#3B2A20" />
      <path d="M30 31.5c1.2 1.3 2.8 1.3 4 0" fill="none" stroke="#3B2A20" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** ロゴ（マーク＋サイト名） */
export function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} className="transition group-hover:-rotate-6 group-hover:scale-105" />
      <span className={`font-display text-lg font-black tracking-tight ${light ? "text-white" : ""}`}>ひとくち</span>
    </span>
  );
}
