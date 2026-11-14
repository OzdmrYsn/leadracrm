import { listMembers } from "@/server/data";
import { handle } from "@/server/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/members">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listMembers(ws));
  });
}
