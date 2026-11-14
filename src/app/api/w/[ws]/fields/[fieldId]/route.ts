import { z } from "zod";
import { deleteField, updateField } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  options: z.array(z.string().trim().max(255)).max(100).optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/fields/[fieldId]">) {
  return handle(async () => {
    const { ws, fieldId } = await ctx.params;
    return Response.json(await updateField(ws, fieldId, await readBody(request, schema)));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/fields/[fieldId]">) {
  return handle(async () => {
    const { ws, fieldId } = await ctx.params;
    await deleteField(ws, fieldId);
    return new Response(null, { status: 204 });
  });
}
