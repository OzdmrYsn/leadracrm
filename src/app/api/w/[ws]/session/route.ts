import { getSession } from "@/server/data";
import { handle } from "@/server/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/session">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await getSession(ws));
  });
}
