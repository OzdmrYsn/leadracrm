import { z } from "zod";
import { reorderPipelines } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ pipelineIds: z.array(z.string().min(1)).min(1).max(50) });

export async function PUT(request: Request, ctx: RouteContext<"/api/w/[ws]/pipelines/order">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { pipelineIds } = await readBody(request, schema);
    return Response.json(await reorderPipelines(ws, pipelineIds));
  });
}
