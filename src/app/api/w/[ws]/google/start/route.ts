import { cookies } from "next/headers";
import { DataError } from "@/server/errors";
import { appOrigin, GOOGLE_SCOPE, googleConfig } from "@/server/google/config";
import { newState, STATE_COOKIE } from "@/server/google/state";
import { handle } from "@/server/http";
import { inWorkspace, requireAdmin } from "@/server/pg/ctx";

// Yöneticiyi Google'ın izin ekranına gönderir. İstenen tek izin: kullanıcının seçtiği dosyalara erişim.
export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/google/start">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    await inWorkspace(ws, async (inner) => requireAdmin(inner));
    const origin = appOrigin(request);
    const cfg = googleConfig(origin);
    if (!cfg) throw new DataError(503, "not_configured", "google connection is not configured");
    const { state, nonce } = newState(ws);
    const jar = await cookies();
    jar.set(STATE_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://"), path: "/api/google", maxAge: 600 });
    const url = new URL(cfg.authUrl);
    url.search = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: `${origin}/api/google/callback`,
      response_type: "code",
      scope: GOOGLE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();
    return Response.redirect(url, 302);
  });
}
