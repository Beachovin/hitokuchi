import { useFetcher, useLocation, useRouteLoaderData } from "react-router";

type RootData = { viewer: { nickname: string | null } | null; eaten: number[] };

/** 「食べた」ボタン（記録すると口コミのお願いが届く・口コミを書くと自動で記録される） */
export function EatenButton({ productId }: { productId: number }) {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher();
  const location = useLocation();
  const saved = root?.eaten.includes(productId) ?? false;
  const pending = fetcher.formData?.get("on");
  const on = pending != null ? pending === "1" : saved;
  const cls = `inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ring-1 transition active:scale-95 ${
    on ? "bg-emerald-500 text-white ring-emerald-500" : "ring-stone-300 hover:bg-stone-100 dark:ring-white/15 dark:hover:bg-white/10"
  }`;
  const label = on ? "食べた！" : "食べた";
  const icon = <span aria-hidden>{on ? "✅" : "🍽️"}</span>;
  if (!root?.viewer) {
    return (
      <a href={`/login?returnTo=${encodeURIComponent(location.pathname)}`} className={cls}>
        {icon}食べた
      </a>
    );
  }
  return (
    <fetcher.Form method="post" action="/api/eaten">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button className={cls} aria-pressed={on}>
        {icon}
        {label}
      </button>
    </fetcher.Form>
  );
}
