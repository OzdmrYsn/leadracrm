import { z } from "zod";
import { createPipeline } from "@/server/data";
import { handle, readBody } from "@/server/http";

const stageName = z.string().trim().min(1).max(100);
const schema = z.object({
  name: z.string().trim().min(1).max(100),
  stageNames: z.object({ incoming: stageName, open: z.array(stageName).min(1).max(20), won: stageName, lost: stageName }),
});

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/pipelines">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createPipeline(ws, await readBody(request, schema)), { status: 201 });
  });
}
