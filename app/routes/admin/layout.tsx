import { Form, NavLink, Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { requireAdmin } from "~/lib/admin.server";
import { Logo } from "~/components/logo";

export const meta: Route.MetaFunction = () => [{ title: "管理画面｜ひとくち" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM product_candidates WHERE status='pending') AS candidates,
            (SELECT COUNT(*) FROM reviews WHERE status='flagged') AS moderation,
            (SELECT COUNT(DISTINCT target_user_id) FROM user_reports WHERE status='open') AS reports`,
  ).first<{ candidates: number; moderation: number; reports: number }>();
  return { admin, counts };
}

const NAV = [
  ["/admin", "ダッシュボード", "📊", null],
  ["/admin/candidates", "承認待ち", "📥", "candidates"],
  ["/admin/products", "商品", "🍱", null],
  ["/admin/features", "特集をつくる", "✨", null],
  ["/admin/reviews", "口コミ管理", "💬", "moderation"],
  ["/admin/reports", "通報", "🚩", "reports"],
  ["/admin/sources", "収集元・ログ", "🤖", null],
  ["/admin/settings", "設定", "⚙️", null],
  ["/admin/users", "ユーザー", "👥", null],
  ["/admin/audit", "操作ログ", "📜", null],
] as const;

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { admin, counts } = loaderData;
  return (
    <div className="min-h-dvh bg-stone-100 font-admin dark:bg-stone-950 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-stone-200 bg-stone-900 p-4 text-stone-300 lg:sticky lg:top-0 lg:h-dvh lg:border-0">
        <div className="mb-6 flex items-center gap-2 px-2 text-white">
          <Logo size={32} light />
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider">ADMIN</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.map(([to, label, icon, badge]) => {
            const n = badge ? counts?.[badge] ?? 0 : 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/admin"}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${isActive ? "bg-white/10 font-semibold text-white" : "hover:bg-white/5 hover:text-white"}`
                }
              >
                <span>{icon}</span>
                {label}
                {n > 0 && <span className="ml-auto rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white">{n}</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-8 hidden px-2 text-xs text-stone-500 lg:block">
          <p className="truncate" title={admin.email}>👤 {admin.nickname ?? admin.email}</p>
          <p className="truncate text-[10px]">{admin.email}</p>
          <div className="mt-2 flex gap-3">
            <a href="/" className="hover:text-white">↗ サイトを表示</a>
            <Form method="post" action="/auth/logout">
              <button className="hover:text-white">ログアウト</button>
            </Form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">
        <Outlet />
      </main>
    </div>
  );
}
