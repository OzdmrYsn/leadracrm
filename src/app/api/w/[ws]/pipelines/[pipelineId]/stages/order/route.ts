import { z } from "zod";
import { reorderStages } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ stageIds: z.array(z.string().min(1)).min(1).max(100) });

export async function PUT(request: Request, ctx: RouteContext<"/api/w/[ws]/pipelines/[pipelineId]/stages/order">) {
  return handle(async () => {
    const { ws, pipelineId } = await ctx.params;
    const { stageIds } = await readBody(request, schema);
    return Response.json(await reorderStages(ws, pipelineId, stageIds));
  });
}
