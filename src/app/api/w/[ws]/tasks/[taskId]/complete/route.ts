import { z } from "zod";
import { completeTask } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ resultText: z.string().trim().max(2000).optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/tasks/[taskId]/complete">) {
  return handle(async () => {
    const { ws, taskId } = await ctx.params;
    return Response.json(await completeTask(ws, taskId, await readBody(request, schema)));
  });
}
