import { createSavedFilter, listSavedFilters } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { savedFilterSchema } from "@/server/schemas";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/saved-filters">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listSavedFilters(ws));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/saved-filters">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createSavedFilter(ws, await readBody(request, savedFilterSchema)), { status: 201 });
  });
}
