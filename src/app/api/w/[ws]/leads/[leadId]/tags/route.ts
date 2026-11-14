import { z } from "zod";
import { setLeadTags } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ tagIds: z.array(z.string().min(1)).max(50) });

export async function PUT(request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]/tags">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    const { tagIds } = await readBody(request, schema);
    return Response.json(await setLeadTags(ws, leadId, tagIds));
  });
}
