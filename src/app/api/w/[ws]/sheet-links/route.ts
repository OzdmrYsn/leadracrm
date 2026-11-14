import { DataError } from "@/server/errors";
import { appOrigin, googleConfig, hookAddress } from "@/server/google/config";
import { handle, readBody } from "@/server/http";
import { createSheetLink, listSheetLinks } from "@/server/pg/sheets";
import { sheetLinkSchema } from "@/server/schemas";

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/sheet-links">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listSheetLinks(ws));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/sheet-links">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const origin = appOrigin(request);
    const cfg = googleConfig(origin);
    if (!cfg) throw new DataError(503, "not_configured", "google connection is not configured");
    const input = await readBody(request, sheetLinkSchema);
    return Response.json(await createSheetLink(ws, input, cfg, hookAddress(cfg, origin)), { status: 201 });
  });
}
