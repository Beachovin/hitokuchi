import { Form, redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { getUser, googleConfigured, safeReturnTo } from "~/lib/auth.server";
import { LogoMark } from "~/components/logo";

export const meta: Route.MetaFunction = () => [{ title: "ログイン｜ひとくち" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (await getUser(request, env)) throw redirect(returnTo);
  const devLogin = env.ADMIN_DEV_BYPASS === "true" && ["localhost", "127.0.0.1"].includes(url.hostname);
  return { configured: googleConfigured(env), devLogin, returnTo };
}

const ERRORS: Record<string, string> = {
  cancelled: "ログインがキャンセルされました。",
  state: "ログインの有効期限が切れました。もう一度お試しください。",
  token: "Google との通信に失敗しました。時間をおいてお試しください。",
  claims: "Google アカウントを確認できませんでした（メールアドレスが未確認の可能性があります）。",
  suspended: "このアカウントは利用規約違反のため利用を停止しています。お心当たりがない場合はお問い合わせください。",
  config: "Google ログインの設定が完了していません（管理者向け：GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定してください）。",
};

export default function Login({ loaderData }: Route.ComponentProps) {
  const { configured, devLogin, returnTo } = loaderData;
  const [params] = useSearchParams();
  const error = params.get("error");
  return (
    <div className="relative mx-auto grid min-h-[70dvh] max-w-md place-items-center px-4 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="blob absolute left-0 top-10 h-64 w-64 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="blob absolute bottom-0 right-0 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl [animation-delay:-6s]" />
      </div>
      <div className="w-full rounded-[2rem] bg-white/80 p-8 text-center shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/70 backdrop-blur dark:bg-stone-900/80 dark:ring-white/10">
        <span className="mx-auto block w-fit"><LogoMark size={64} /></span>
        <h1 className="mt-4 font-display text-2xl font-black">ひとくちにログイン</h1>
        <p className="mt-2 text-sm text-stone-500">口コミの投稿や Good / Bad にはログインが必要です。</p>

        {error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-left text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{ERRORS[error] ?? "ログインに失敗しました。"}</p>}

        <a
          href={configured ? `/auth/google?returnTo=${encodeURIComponent(returnTo)}` : undefined}
          aria-disabled={!configured}
          className={`mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 font-semibold text-stone-800 shadow-sm transition dark:border-white/15 dark:bg-stone-800 dark:text-white ${
            configured ? "hover:bg-stone-50 hover:shadow dark:hover:bg-stone-700" : "cursor-not-allowed opacity-50"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Google でログイン
        </a>
        {!configured && <p className="mt-2 text-xs text-stone-400">Google ログインは現在設定中です。</p>}

        <p className="mt-6 text-left text-xs leading-relaxed text-stone-400">
          ログインすると、<a href="/privacy" className="underline">プライバシーポリシー</a>に同意したものとみなします。Google アカウントの氏名・メールアドレス・写真は公開されません。表示名は初回ログイン時に決めるニックネームです。
        </p>

        {devLogin && (
          <Form method="post" action="/auth/dev" className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 text-left dark:border-amber-500/30 dark:bg-amber-500/5">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">開発用ログイン（localhost のみ）</p>
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="mt-2 flex gap-2">
              <input name="label" defaultValue="tester1" className="min-w-0 flex-1 rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-amber-200 dark:bg-stone-900" aria-label="テストユーザー名" />
              <button className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">ログイン</button>
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}
