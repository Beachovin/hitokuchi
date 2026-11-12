import { Link, useLocation } from "react-router";

type Tab = { to: string; label: string; icon: React.ReactNode; match: (p: string) => boolean };

const I = {
  home: (
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  heart: <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.5 3.4 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
};

/** スマホ用の下部タブバー（中央の「＋」から口コミを書く） */
export function TabBar({ loggedIn, favCount }: { loggedIn: boolean; favCount: number }) {
  const { pathname, search } = useLocation();
  const login = (to: string) => (loggedIn ? to : `/login?returnTo=${encodeURIComponent(to)}`);
  const tabs: Tab[] = [
    { to: "/", label: "ホーム", icon: I.home, match: (p) => p === "/" },
    { to: "/products", label: "さがす", icon: I.search, match: (p) => p.startsWith("/products") || p.startsWith("/weekly") || p.startsWith("/features") },
    { to: login("/favorites"), label: "気になる", icon: I.heart, match: (p) => p.startsWith("/favorites") },
    { to: login("/mypage"), label: "マイページ", icon: I.user, match: (p) => p.startsWith("/mypage") || p.startsWith("/notifications") },
  ];
  const Item = ({ t }: { t: Tab }) => {
    const active = t.match(pathname);
    return (
      <Link to={t.to} className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-bold transition ${active ? "text-brand-600" : "text-stone-400"}`} aria-current={active ? "page" : undefined}>
        <span className="relative">
          <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {t.icon}
          </svg>
          {t.label === "気になる" && favCount > 0 && (
            <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] text-white">{favCount > 99 ? "99+" : favCount}</span>
          )}
        </span>
        {t.label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-cream-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-stone-900/90"
    >
      <div className="mx-auto flex max-w-md items-end px-2">
        <Item t={tabs[0]} />
        <Item t={tabs[1]} />
        <Link
          to={login("/post")}
          aria-label="口コミを書く"
          className={`-mt-6 mx-1 grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-brand-500 text-white shadow-lg shadow-brand-500/40 ring-4 ring-cream transition active:scale-90 dark:ring-stone-950 ${pathname === "/post" ? "scale-105" : ""}`}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
        <Item t={tabs[2]} />
        <Item t={tabs[3]} />
      </div>
      <span className="sr-only">{search}</span>
    </nav>
  );
}
