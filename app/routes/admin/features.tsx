import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/features";
import { audit, requireAdmin } from "~/lib/admin.server";
import { listCustomFeatures } from "~/lib/custom-features.server";
import { themeGradient } from "~/lib/features";
import { Badge, Panel, PageTitle, btn } from "~/components/admin-ui";
import { relativeDate } from "~/lib/format";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireAdmin(request, env);
  return { features: await listCustomFeatures(env.DB, false) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireAdmin(request, env);
  const row = await env.DB.prepare("INSERT INTO features(slug, title, created_by) VALUES (?, ?, ?) RETURNING id")
    .bind(`feature-${Date.now().toString(36)}`, "新しい特集", admin.email)
    .first<{ id: number }>();
  await audit(env, request, admin, "feature.create", `feature:${row!.id}`);
  throw redirect(`/admin/features/${row!.id}`);
}

export default function AdminFeatures({ loaderData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <>
      <PageTitle title="特集をつくる">
        <Form method="post">
          <button className={btn.primary} disabled={busy}>＋ 新しい特集</button>
        </Form>
      </PageTitle>
      <p className="mb-4 text-sm text-stone-500">商品を検索して選ぶだけで特集ページを作れます。公開すると「特集」ページの先頭に表示されます。</p>
      {loaderData.features.length === 0 ? (
        <Panel className="py-14 text-center text-stone-500">まだ特集がありません。「＋ 新しい特集」から作成してください。</Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loaderData.features.map((f) => (
            <Link key={f.id} to={`/admin/features/${f.id}`} className="card-lift overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200 dark:bg-stone-900 dark:ring-white/10">
              <div className={`bg-gradient-to-br ${themeGradient(f.theme)} p-5 text-white`}>
                <p className="text-3xl">{f.emoji}</p>
                <p className="mt-2 font-display text-lg font-black">{f.title}</p>
                <p className="line-clamp-1 text-xs opacity-85">{f.lead || "（リード文なし）"}</p>
              </div>
              <div className="flex items-center gap-2 p-3 text-xs text-stone-500">
                <Badge tone={f.status === "published" ? "green" : "stone"}>{f.status === "published" ? "公開中" : "下書き"}</Badge>
                <span>{f.item_count}商品</span>
                <span className="ml-auto">{relativeDate(f.updated_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
