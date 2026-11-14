import { deleteIntake, updateIntake } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { intakePatchSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/intakes/[intakeId]">) {
  return handle(async () => {
    const { ws, intakeId } = await ctx.params;
    return Response.json(await updateIntake(ws, intakeId, await readBody(request, intakePatchSchema)));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/intakes/[intakeId]">) {
  return handle(async () => {
    const { ws, intakeId } = await ctx.params;
    await deleteIntake(ws, intakeId);
    return new Response(null, { status: 204 });
  });
}
