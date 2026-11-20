import { setCancellation } from "@/server/data";
import { handle } from "@/server/http";
import { appOrigin } from "@/server/origin";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/billing/resume">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    await setCancellation(ws, false, appOrigin(request));
    return new Response(null, { status: 204 });
  });
}
