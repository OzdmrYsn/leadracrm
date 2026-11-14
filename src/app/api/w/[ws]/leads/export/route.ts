import { exportLeads } from "@/server/data";
import { csvResponse, handle, parseLeadFilter } from "@/server/http";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/leads/export">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return csvResponse(await exportLeads(ws, parseLeadFilter(request)));
  });
}
