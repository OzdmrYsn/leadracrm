import { z } from "zod";
import { createStage } from "@/server/data";
import { colorSchema, handle, readBody } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1).max(100), color: colorSchema });

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/pipelines/[pipelineId]/stages">) {
  return handle(async () => {
    const { ws, pipelineId } = await ctx.params;
    return Response.json(await createStage(ws, pipelineId, await readBody(request, schema)), { status: 201 });
  });
}
