import { getBilling } from "@/server/data";
import { handle } from "@/server/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/billing">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await getBilling(ws));
  });
}
