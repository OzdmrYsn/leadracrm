import { deleteLossReason, updateLossReason } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { nameSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/loss-reasons/[reasonId]">) {
  return handle(async () => {
    const { ws, reasonId } = await ctx.params;
    return Response.json(await updateLossReason(ws, reasonId, await readBody(request, nameSchema(120))));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/loss-reasons/[reasonId]">) {
  return handle(async () => {
    const { ws, reasonId } = await ctx.params;
    await deleteLossReason(ws, reasonId);
    return new Response(null, { status: 204 });
  });
}
