export function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const px = { sm: 14, md: 18, lg: 26 }[size];
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`5点中${value.toFixed(1)}点`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} width={px} height={px} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={`s${i}-${Math.round(fill * 100)}`}>
                <stop offset={`${fill * 100}%`} stopColor="#f59e0b" />
                <stop offset={`${fill * 100}%`} stopColor="currentColor" stopOpacity="0.18" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#s${i}-${Math.round(fill * 100)})`}
              d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3 5.9 20.7l1.5-6.7L2.3 9.4l6.8-.7z"
            />
          </svg>
        );
      })}
    </span>
  );
}
