import { z } from "zod";
import { deleteTask, updateTask } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({
  typeId: z.string().min(1).optional(),
  text: z.string().trim().max(2000).optional(),
  dueAt: z.iso.datetime().optional(),
  responsibleUserId: z.string().min(1).nullable().optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/tasks/[taskId]">) {
  return handle(async () => {
    const { ws, taskId } = await ctx.params;
    return Response.json(await updateTask(ws, taskId, await readBody(request, schema)));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/tasks/[taskId]">) {
  return handle(async () => {
    const { ws, taskId } = await ctx.params;
    await deleteTask(ws, taskId);
    return new Response(null, { status: 204 });
  });
}
