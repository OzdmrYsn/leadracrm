import { exportContacts } from "@/server/data";
import { csvResponse, handle } from "@/server/http";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/contacts/export">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return csvResponse(await exportContacts(ws, new URL(request.url).searchParams.get("q") ?? ""));
  });
}
