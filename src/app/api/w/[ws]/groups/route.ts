import { createGroup, listGroups } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { groupSchema } from "@/server/schemas";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/groups">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listGroups(ws));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/groups">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createGroup(ws, await readBody(request, groupSchema)), { status: 201 });
  });
}
