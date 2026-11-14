import { getBoard } from "@/server/data";
import { handle, parseLeadFilter } from "@/server/http";

// pipelineId yerine "main" verilirse ana pipeline döner.
export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/pipelines/[pipelineId]/board">) {
  return handle(async () => {
    const { ws, pipelineId } = await ctx.params;
    return Response.json(await getBoard(ws, pipelineId === "main" ? undefined : pipelineId, parseLeadFilter(request)));
  });
}
