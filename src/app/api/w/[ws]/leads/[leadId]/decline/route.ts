import { declineLead } from "@/server/data";
import { handle } from "@/server/http";

export async function POST(_request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]/decline">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    await declineLead(ws, leadId);
    return new Response(null, { status: 204 });
  });
}
