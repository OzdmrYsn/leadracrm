import { DataError } from "@/server/errors";
import { appOrigin, googleConfig } from "@/server/google/config";
import { handle } from "@/server/http";
import { syncLinkNow } from "@/server/pg/sheets";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/sheet-links/[linkId]/sync">) {
  return handle(async () => {
    const { ws, linkId } = await ctx.params;
    const cfg = googleConfig(appOrigin(request));
    if (!cfg) throw new DataError(503, "not_configured", "google connection is not configured");
    return Response.json(await syncLinkNow(ws, linkId, cfg));
  });
}
