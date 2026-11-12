import { data } from "react-router";
import type { Route } from "./+types/battle";
import { getUser } from "~/lib/auth.server";
import { battleVoterKey, voteBattle } from "~/lib/battles.server";

// 新商品バトルの投票（未ログインでも可）
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await getUser(request, env);
  const form = await request.formData();
  const battleId = Number(form.get("battleId"));
  const choice = form.get("choice") === "b" ? "b" : "a";
  const exists = await env.DB.prepare("SELECT 1 FROM battles WHERE id = ?").bind(battleId).first();
  if (!exists) return data({ ok: false as const }, { status: 404 });
  const voter = battleVoterKey(request, user?.id ?? null);
  const voted = await voteBattle(env.DB, battleId, voter.key, choice);
  const init = voter.setCookie ? { headers: { "Set-Cookie": voter.setCookie } } : undefined;
  if (!voted) return data({ ok: false as const, error: "このバトルには投票済みです" }, { status: 409, ...init });
  return data({ ok: true as const }, init);
}
export const loader = () => new Response("Not found", { status: 404 });
