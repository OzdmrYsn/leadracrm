import { z } from "zod";
import { linkIncomingLead } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ targetLeadId: z.string().min(1).max(64) });

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]/link">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    const { targetLeadId } = await readBody(request, schema);
    return Response.json(await linkIncomingLead(ws, leadId, targetLeadId));
  });
}
