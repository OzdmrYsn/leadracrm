import { DataError } from "@/server/errors";
import { appOrigin, googleConfig } from "@/server/google/config";
import { handle, readBody } from "@/server/http";
import { inspectSpreadsheet } from "@/server/pg/sheets";
import { sheetInspectSchema } from "@/server/schemas";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/google/inspect">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const cfg = googleConfig(appOrigin(request));
    if (!cfg) throw new DataError(503, "not_configured", "google connection is not configured");
    const input = await readBody(request, sheetInspectSchema);
    return Response.json(await inspectSpreadsheet(ws, input.accountId, input.spreadsheetId, cfg));
  });
}
