import { deleteSavedFilter } from "@/server/data";
import { handle } from "@/server/http";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/saved-filters/[filterId]">) {
  return handle(async () => {
    const { ws, filterId } = await ctx.params;
    await deleteSavedFilter(ws, filterId);
    return new Response(null, { status: 204 });
  });
}
