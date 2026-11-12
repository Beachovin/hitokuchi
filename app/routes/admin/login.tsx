import { Form, redirect } from "react-router";
import type { Route } from "./+types/login";
import { getUser, googleConfigured, safeReturnTo } from "~/lib/auth.server";
import { adminHostAllowed, isAdmin } from "~/lib/admin.server";
import { Logo } from "~/components/logo";

export const meta: Route.MetaFunction = () => [{ title: "管理者ログイン｜ひとくち" }, { name: "robots", content: "noindex, nofollow" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  if (!adminHostAllowed(request, env)) throw new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo")).startsWith("/admin") ? safeReturnTo(url.searchParams.get("returnTo")) : "/admin";
  const reason = url.searchParams.get("reason");
  const user = await getUser(request, env);
  const admin = user ? await isAdmin(env, user) : false;
  const hours = Number(env.ADMIN_SESSION_HOURS) || 12;
  const fresh = user ? Date.now() - new Date(user.session_created_at.replace(" ", "T") + "Z").getTime() < hours * 3600_000 : false;
  if (user && admin && fresh && reason !== "expired") throw redirect(returnTo);
  return {
    returnTo,
    reason: reason ?? (user && admin && !fresh ? "expired" : null),
    loggedInAs: user ? user.email : null,
    notAdmin: !!user && !admin,
    configured: googleConfigured(env),
    devLogin: env.ADMIN_DEV_BYPASS === "true" && ["localhost", "127.0.0.1"].includes(url.hostname),
    hours,
  };
}

export default function AdminLogin({ loaderData }: Route.ComponentProps) {
  const { returnTo, reason, loggedInAs, notAdmin, configured, devLogin, hours } = loaderData;
  return (
    <div className="grid min-h-dvh place-items-center bg-stone-950 px-4 text-stone-100">
      <div className="w-full max-w-sm rounded-3xl bg-stone-900 p-8 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <Logo size={34} light />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider">ADMIN</span>
        </div>
        <h1 className="mt-6 text-xl font-bold">管理者ログイン</h1>
        <p className="mt-1 text-sm text-stone-400">管理者として登録された Google アカウントでログインしてください。</p>

        {reason === "expired" && (
          <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300">安全のため、管理画面はログインから{hours}時間で再ログインが必要です。</p>
        )}
        {notAdmin && (
          <div className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">
            <p>{loggedInAs} には管理者権限がありません。</p>
            <Form method="post" action="/auth/logout" className="mt-2">
              <button className="text-xs underline">ログアウトして別のアカウントを使う</button>
            </Form>
          </div>
        )}

        <a
          href={configured ? `/auth/google?returnTo=${encodeURIComponent(returnTo)}` : undefined}
          aria-disabled={!configured}
          className={`mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-semibold text-stone-900 transition ${configured ? "hover:bg-stone-100" : "cursor-not-allowed opacity-40"}`}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Google で管理者ログイン
        </a>
        {!configured && <p className="mt-2 text-xs text-stone-500">GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です。</p>}

        {devLogin && (
          <Form method="post" action="/auth/dev" className="mt-6 rounded-xl border border-dashed border-amber-500/40 p-3">
            <p className="text-xs font-semibold text-amber-300">開発用 管理者ログイン（localhost のみ）</p>
            <input type="hidden" name="admin" value="1" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="mt-2 flex gap-2">
              <input name="label" defaultValue="admin-dev" aria-label="開発用ユーザー名" className="min-w-0 flex-1 rounded-lg bg-stone-800 px-2 py-1.5 text-sm ring-1 ring-white/10" />
              <button className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-stone-950">ログイン</button>
            </div>
          </Form>
        )}
        <a href="/" className="mt-6 block text-center text-xs text-stone-500 hover:text-stone-300">← サイトに戻る</a>
      </div>
    </div>
  );
}
