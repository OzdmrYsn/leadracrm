import { createTaskType } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { nameSchema } from "@/server/schemas";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/task-types">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createTaskType(ws, await readBody(request, nameSchema(60))), { status: 201 });
  });
}
