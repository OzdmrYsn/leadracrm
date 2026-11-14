import { exportCompanies } from "@/server/data";
import { csvResponse, handle } from "@/server/http";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/companies/export">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return csvResponse(await exportCompanies(ws, new URL(request.url).searchParams.get("q") ?? ""));
  });
}
