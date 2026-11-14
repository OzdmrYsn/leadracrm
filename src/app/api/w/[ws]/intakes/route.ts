import { createIntake, listIntakes } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { intakeSchema } from "@/server/schemas";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/intakes">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listIntakes(ws));
  });
}

// Yanıttaki "token" gizli adresin anahtarıdır ve yalnız bu yanıtta döner.
export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/intakes">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createIntake(ws, await readBody(request, intakeSchema)), { status: 201 });
  });
}
