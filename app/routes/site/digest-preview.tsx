import type { Route } from "./+types/digest-preview";
import { requireUser } from "~/lib/auth.server";
import { buildDigest, renderDigestHtml } from "~/lib/digest.server";

export const meta: Route.MetaFunction = () => [{ title: "ダイジェストのプレビュー｜ひとくち" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(request, env);
  const origin = new URL(request.url).origin;
  const d = await buildDigest(env.DB, user.id, origin);
  return { subject: d.subject, html: renderDigestHtml(d, origin, user.nickname ?? ""), optIn: false };
}

export default function DigestPreview({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 md:pt-10">
      <a href="/mypage#digest" className="text-sm text-stone-500 hover:text-stone-900">← マイページに戻る</a>
      <h1 className="mt-2 font-display text-2xl font-black">ダイジェストのプレビュー</h1>
      <p className="mt-1 text-sm text-stone-500">毎週月曜の朝に届くメールの内容です（件名：{loaderData.subject}）</p>
      <iframe title="ダイジェスト" srcDoc={loaderData.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mt-5 h-[900px] w-full rounded-2xl bg-white ring-1 ring-stone-200" />
    </div>
  );
}
