import type { Route } from "./+types/callback";
import { finishGoogleLogin } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return finishGoogleLogin(request, context.cloudflare.env);
}
