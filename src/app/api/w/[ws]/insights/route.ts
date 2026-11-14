import { getInsights } from "@/server/data";
import { handle } from "@/server/http";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/insights">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const params = new URL(request.url).searchParams;
    return Response.json(await getInsights(ws, { days: Number(params.get("days")) || undefined, responsible: params.get("responsible") ?? undefined }));
  });
}
