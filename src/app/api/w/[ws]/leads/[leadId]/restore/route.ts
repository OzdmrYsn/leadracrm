import { restoreLead } from "@/server/data";
import { handle } from "@/server/http";

export async function POST(_request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]/restore">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    return Response.json(await restoreLead(ws, leadId));
  });
}
