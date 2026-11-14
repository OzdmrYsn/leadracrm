import { deleteGroup, updateGroup } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { groupSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/groups/[groupId]">) {
  return handle(async () => {
    const { ws, groupId } = await ctx.params;
    return Response.json(await updateGroup(ws, groupId, await readBody(request, groupSchema)));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/groups/[groupId]">) {
  return handle(async () => {
    const { ws, groupId } = await ctx.params;
    await deleteGroup(ws, groupId);
    return new Response(null, { status: 204 });
  });
}
