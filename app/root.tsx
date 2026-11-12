import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteLoaderData } from "react-router";
import { getPublicSettings, type PublicSettings } from "./lib/settings.server";
import { getUser } from "./lib/auth.server";
import { bookmarkedIds } from "./lib/db.server";
import { eatenIds, unreadCount } from "./lib/engage.server";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&family=Noto+Sans+JP:wght@400;500;700&display=swap",
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const [publicSettings, user] = await Promise.all([getPublicSettings(env.DB), getUser(request, env)]);
  const [bookmarks, eaten, unread] = user
    ? await Promise.all([bookmarkedIds(env.DB, user.id), eatenIds(env.DB, user.id), unreadCount(env.DB, user.id)])
    : [[], [], 0];
  // ヘッダー表示と「気になる」「食べた」状態用。メールアドレスなどは渡さない
  return {
    publicSettings,
    viewer: user ? { nickname: user.nickname, avatarUrl: user.avatar_key ? `/img/${encodeURIComponent(user.avatar_key)}` : null } : null,
    bookmarks,
    eaten,
    unread,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<{ publicSettings: PublicSettings }>("root");
  const adClient = data?.publicSettings.ads_enabled ? data.publicSettings.adsense_client : "";
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#fff8f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="ひとくち" />
        <Meta />
        <Links />
        {/^ca-pub-\d+$/.test(adClient) && (
          <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`} crossOrigin="anonymous" />
        )}
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "エラーが発生しました";
  let detail = "時間をおいて再度お試しください。";
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "ページが見つかりません" : error.status === 403 ? "アクセスできません" : `${error.status}`;
    detail =
      error.status === 404
        ? "お探しのページは移動または削除された可能性があります。"
        : error.status === 403
          ? "このページを表示する権限がありません。"
          : error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }
  return (
    <main className="min-h-dvh grid place-items-center p-8 text-center">
      <div>
        <p className="text-6xl mb-4">🍙</p>
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-stone-500 mb-6">{detail}</p>
        <a href="/" className="rounded-full bg-stone-900 px-5 py-2.5 text-white dark:bg-white dark:text-stone-900">トップへ戻る</a>
      </div>
    </main>
  );
}
