import { search } from "@/server/data";
import { handle } from "@/server/http";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/search">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    // En çok 120 karakter: daha uzunu arama değil, yapıştırılmış metindir.
    const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 120);
    return Response.json(await search(ws, query));
  });
}
