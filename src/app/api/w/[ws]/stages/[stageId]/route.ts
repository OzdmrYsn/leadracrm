import { z } from "zod";
import { deleteStage, updateStage } from "@/server/data";
import { colorSchema, handle, readBody } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1).max(100).optional(), color: colorSchema.optional() });

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/stages/[stageId]">) {
  return handle(async () => {
    const { ws, stageId } = await ctx.params;
    return Response.json(await updateStage(ws, stageId, await readBody(request, schema)));
  });
}

// Aşamada lead varsa ?moveTo=<aşama> zorunludur.
export async function DELETE(request: Request, ctx: RouteContext<"/api/w/[ws]/stages/[stageId]">) {
  return handle(async () => {
    const { ws, stageId } = await ctx.params;
    await deleteStage(ws, stageId, new URL(request.url).searchParams.get("moveTo") ?? undefined);
    return new Response(null, { status: 204 });
  });
}
