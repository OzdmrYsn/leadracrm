import { clientAddress } from "@/server/auth";
import { DataError, previewInvitation } from "@/server/data";
import { handle } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";

// Herkese açık: davet sayfasının göstereceği bilgi. Koruma bağlantıdaki belirteçtir.
export async function GET(request: Request, ctx: RouteContext<"/api/invitations/[token]">) {
  return handle(async () => {
    if (!allowRequest(`invite:${clientAddress(request)}`, 30, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const { token } = await ctx.params;
    return Response.json(await previewInvitation(token));
  });
}
