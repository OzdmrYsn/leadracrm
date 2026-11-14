import { z } from "zod";
import { deleteTag, updateTag } from "@/server/data";
import { colorSchema, handle, readBody } from "@/server/http";

const schema = z.object({ color: colorSchema.nullable() });

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/tags/[tagId]">) {
  return handle(async () => {
    const { ws, tagId } = await ctx.params;
    return Response.json(await updateTag(ws, tagId, await readBody(request, schema)));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/tags/[tagId]">) {
  return handle(async () => {
    const { ws, tagId } = await ctx.params;
    await deleteTag(ws, tagId);
    return new Response(null, { status: 204 });
  });
}
