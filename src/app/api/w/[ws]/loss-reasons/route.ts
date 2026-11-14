import { createLossReason } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { nameSchema } from "@/server/schemas";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/loss-reasons">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createLossReason(ws, await readBody(request, nameSchema(120))), { status: 201 });
  });
}
