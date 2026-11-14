import { z } from "zod";
import { updatePipeline } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1).max(100).optional(), incomingEnabled: z.boolean().optional() });

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/pipelines/[pipelineId]">) {
  return handle(async () => {
    const { ws, pipelineId } = await ctx.params;
    return Response.json(await updatePipeline(ws, pipelineId, await readBody(request, schema)));
  });
}
