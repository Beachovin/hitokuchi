import { useFetcher, useLocation, useRouteLoaderData } from "react-router";

type RootData = { viewer: { nickname: string | null; avatarUrl: string | null } | null; bookmarks: number[] };

/** 「気になる」ボタン。未ログインならログイン画面へ。押した直後に見た目を切り替える（楽観的更新） */
export function BookmarkButton({ productId, variant = "icon" }: { productId: number; variant?: "icon" | "full" }) {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher();
  const location = useLocation();
  const saved = root?.bookmarks.includes(productId) ?? false;
  const pending = fetcher.formData?.get("on");
  const on = pending != null ? pending === "1" : saved;

  const icon = (
    <svg width={18} height={18} viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
      <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.4 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z" />
    </svg>
  );
  const iconCls = `grid h-8 w-8 place-items-center rounded-full md:h-9 md:w-9 shadow-md backdrop-blur transition active:scale-90 ${
    on ? "bg-rose-500 text-white" : "bg-white/90 text-stone-600 hover:text-rose-500 dark:bg-stone-900/80 dark:text-stone-300"
  }`;
  const fullCls = `inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ring-1 transition active:scale-95 ${
    on ? "bg-rose-500 text-white ring-rose-500" : "ring-stone-300 hover:bg-stone-100 dark:ring-white/15 dark:hover:bg-white/10"
  }`;
  const label = on ? "気になる登録済み" : "気になる";

  if (!root?.viewer) {
    const href = `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
    return (
      <a href={href} className={variant === "icon" ? iconCls : fullCls} aria-label="ログインして気になるに登録" title="ログインして気になるに登録">
        {icon}
        {variant === "full" && "気になる"}
      </a>
    );
  }
  return (
    <fetcher.Form method="post" action="/api/bookmark">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button className={variant === "icon" ? iconCls : fullCls} aria-pressed={on} aria-label={label} title={label}>
        {icon}
        {variant === "full" && label}
      </button>
    </fetcher.Form>
  );
}
