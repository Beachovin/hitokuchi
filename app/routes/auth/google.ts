import type { Route } from "./+types/google";
import { googleConfigured, safeReturnTo, startGoogleLogin } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  if (!googleConfigured(env)) return new Response(null, { status: 302, headers: { Location: "/login?error=config" } });
  return startGoogleLogin(request, env, safeReturnTo(new URL(request.url).searchParams.get("returnTo")));
}
