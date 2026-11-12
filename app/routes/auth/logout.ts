import type { Route } from "./+types/logout";
import { destroySession } from "~/lib/auth.server";

export async function action({ request, context }: Route.ActionArgs) {
  return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": await destroySession(request, context.cloudflare.env) } });
}

export const loader = () => new Response(null, { status: 302, headers: { Location: "/" } });
