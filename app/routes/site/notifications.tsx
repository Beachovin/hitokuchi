import { useEffect } from "react";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/notifications";
import { requireUser } from "~/lib/auth.server";
import { listNotifications, markAllRead } from "~/lib/engage.server";
import { relativeDate } from "~/lib/format";

export const meta: Route.MetaFunction = () => [{ title: "お知らせ｜ひとくち" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  return { items: await listNotifications(env.DB, user.id) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  await markAllRead(env.DB, user.id);
  return { ok: true };
}

const ICON: Record<string, string> = { release_today: "🎉", ask_review: "🍙", first_review_bonus: "🥇", achievement: "🏅" };

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const fetcher = useFetcher();
  const hasUnread = items.some((n) => !n.read_at);
  // 開いたら既読にする（表示中は未読の印を残す）
  useEffect(() => {
    if (hasUnread && fetcher.state === "idle" && !fetcher.data) fetcher.submit(null, { method: "post" });
  }, [hasUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-2xl px-4 pt-4 md:pt-10">
      <h1 className="font-display text-3xl font-black">お知らせ</h1>
      <p className="mt-1 text-sm text-stone-500">「気になる」商品の発売日や、口コミのお願いなどをお知らせします。</p>
      {items.length === 0 ? (
        <div className="mt-8 rounded-3xl border-2 border-dashed border-stone-200 p-12 text-center text-stone-500 dark:border-white/10">
          <p className="text-5xl">🔔</p>
          <p className="mt-3">お知らせはまだありません。商品を「気になる」に登録すると、発売日にお知らせします。</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 overflow-hidden rounded-3xl bg-white ring-1 ring-stone-200/70 dark:divide-white/10 dark:bg-stone-900 dark:ring-white/10">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={n.link} className={`flex items-center gap-4 p-4 transition hover:bg-stone-50 dark:hover:bg-white/5 ${n.read_at ? "" : "bg-brand-50/60 dark:bg-brand-500/[0.06]"}`}>
                {n.image_url ? (
                  <img src={n.image_url} alt="" referrerPolicy="no-referrer" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-stone-200 dark:ring-white/10" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone-100 text-2xl dark:bg-white/10">{ICON[n.kind] ?? "🔔"}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">
                    <span className="mr-1">{ICON[n.kind] ?? "🔔"}</span>
                    {n.body}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">{relativeDate(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" aria-label="未読" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
