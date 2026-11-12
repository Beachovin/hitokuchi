import { Form, Link, NavLink, Outlet, useLocation, useRouteLoaderData, useSearchParams } from "react-router";
import { Logo } from "~/components/logo";
import { TabBar } from "~/components/tab-bar";
import { PwaManager } from "~/components/pwa";

type RootData = { viewer: { nickname: string | null; avatarUrl: string | null } | null; bookmarks: number[]; unread: number };

export default function SiteLayout() {
  const [params] = useSearchParams();
  const location = useLocation();
  const root = useRouteLoaderData<RootData>("root");
  const viewer = root?.viewer;
  const favCount = root?.bookmarks.length ?? 0;
  const here = location.pathname + location.search;

  const Bell = () =>
    viewer ? (
      <NavLink
        to="/notifications"
        className={({ isActive }) => `relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-cream-200/60 dark:hover:bg-white/10 ${isActive ? "text-brand-600" : "text-stone-600 dark:text-stone-300"}`}
        aria-label={`お知らせ${root?.unread ? `（未読${root.unread}件）` : ""}`}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {!!root?.unread && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{root.unread > 99 ? "99+" : root.unread}</span>}
      </NavLink>
    ) : null;

  const Avatar = () =>
    viewer ? (
      <Link to="/mypage" className="flex shrink-0 items-center gap-2 rounded-full bg-white py-1 pl-1 pr-1 text-sm font-bold shadow-sm ring-1 ring-cream-200 transition hover:shadow xl:pr-3 dark:bg-stone-900 dark:ring-white/10" title="マイページ">
        {viewer.avatarUrl ? (
          <img src={viewer.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-brand-500 text-xs font-bold text-white">{(viewer.nickname ?? "?").slice(0, 1)}</span>
        )}
        <span className="hidden max-w-24 truncate xl:inline">{viewer.nickname ?? "設定する"}</span>
      </Link>
    ) : location.pathname !== "/login" ? (
      <Link to={`/login?returnTo=${encodeURIComponent(here)}`} className="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900">
        ログイン
      </Link>
    ) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-cream/85 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-4 md:pt-3 dark:bg-stone-950/80">
        <div className="mx-auto flex max-w-6xl items-center gap-2 md:gap-3 md:rounded-full md:bg-white md:px-3 md:py-2 md:shadow-sm md:ring-1 md:ring-cream-200 dark:md:bg-stone-900 dark:md:ring-white/10">
          <Link to="/" className="group flex shrink-0 items-center" aria-label="ひとくち トップへ">
            <Logo size={34} />
          </Link>
          {/* PC：検索欄とメニュー */}
          <Form action="/products" className="relative ml-auto hidden w-full max-w-sm lg:block">
            <input
              name="q"
              defaultValue={params.get("q") ?? ""}
              placeholder="商品名・メーカーで検索"
              aria-label="検索"
              className="w-full rounded-full bg-cream py-2 pl-9 pr-3 text-sm outline-none ring-brand-400 transition focus:bg-white focus:ring-2 dark:bg-white/10"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Form>
          <nav className="ml-auto hidden shrink-0 items-center gap-0.5 whitespace-nowrap text-sm font-bold md:flex lg:ml-0">
            {[
              ["/weekly", "週間まとめ"],
              ["/features", "特集"],
              ["/products?sort=rating", "ランキング"],
              [viewer ? "/favorites" : "/login?returnTo=%2Ffavorites", `気になる${favCount ? ` ${favCount}` : ""}`],
            ].map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `rounded-full px-2 py-2 transition hover:bg-cream lg:px-3 ${isActive ? "text-brand-600" : "text-stone-600 dark:text-stone-300"}`}>
                {label}
              </NavLink>
            ))}
            <Link to={viewer ? "/post" : "/login?returnTo=%2Fpost"} className="ml-1 rounded-full bg-gradient-to-br from-amber-400 to-brand-500 px-3 py-2 text-white shadow-sm shadow-brand-500/30 transition hover:brightness-105 lg:px-4">
              ＋ <span className="lg:hidden">書く</span><span className="hidden lg:inline">口コミを書く</span>
            </Link>
          </nav>
          {/* スマホ：検索ボタン */}
          <Link to="/products?focus=1" className="ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-full text-stone-600 hover:bg-cream-200/60 md:ml-0 lg:hidden dark:text-stone-300" aria-label="検索">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <Bell />
          <Avatar />
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 hidden border-t border-cream-200 py-10 text-center text-sm text-stone-500 md:block dark:border-white/10">
        <div className="flex justify-center"><Logo size={32} /></div>
        <p className="mt-2">食べた人の声で見つける、きょうのおいしい。</p>
        <nav className="mt-4 flex justify-center gap-4 text-xs">
          <Link to="/weekly" className="hover:text-stone-900 dark:hover:text-white">週間まとめ</Link>
          <Link to="/features" className="hover:text-stone-900 dark:hover:text-white">特集</Link>
          <Link to="/products" className="hover:text-stone-900 dark:hover:text-white">商品一覧</Link>
          <Link to="/terms" className="hover:text-stone-900 dark:hover:text-white">利用規約</Link>
          <Link to="/privacy" className="hover:text-stone-900 dark:hover:text-white">プライバシーポリシー</Link>
        </nav>
        <p className="mt-4 text-xs">掲載情報・画像は各社の公開情報をもとにしています。最新情報は公式サイトをご確認ください。</p>
      </footer>
      {/* スマホ用の小さなフッター（タブバーの上） */}
      <p className="pb-tabbar px-4 pt-10 text-center text-[11px] text-stone-400 md:hidden">
        <Link to="/terms" className="underline">利用規約</Link>　<Link to="/privacy" className="underline">プライバシーポリシー</Link>　掲載情報は各社の公開情報にもとづきます
      </p>

      <TabBar loggedIn={!!viewer} favCount={favCount} />
      <PwaManager />
    </div>
  );
}
