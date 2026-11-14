import { deleteAutomation, updateAutomation } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { automationPatchSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/automations/[automationId]">) {
  return handle(async () => {
    const { ws, automationId } = await ctx.params;
    return Response.json(await updateAutomation(ws, automationId, await readBody(request, automationPatchSchema)));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/automations/[automationId]">) {
  return handle(async () => {
    const { ws, automationId } = await ctx.params;
    await deleteAutomation(ws, automationId);
    return new Response(null, { status: 204 });
  });
}
