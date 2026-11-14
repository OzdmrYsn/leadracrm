import { acceptLead } from "@/server/data";
import { handle } from "@/server/http";

export async function POST(_request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]/accept">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    return Response.json(await acceptLead(ws, leadId));
  });
}
