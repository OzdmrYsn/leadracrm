import { deleteTaskType, updateTaskType } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { nameSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/task-types/[typeId]">) {
  return handle(async () => {
    const { ws, typeId } = await ctx.params;
    return Response.json(await updateTaskType(ws, typeId, await readBody(request, nameSchema(60))));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/task-types/[typeId]">) {
  return handle(async () => {
    const { ws, typeId } = await ctx.params;
    await deleteTaskType(ws, typeId);
    return new Response(null, { status: 204 });
  });
}
