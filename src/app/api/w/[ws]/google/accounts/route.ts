import type { GoogleStatus } from "@/lib/types";
import { appOrigin, googleConfig } from "@/server/google/config";
import { handle } from "@/server/http";
import { listGoogleAccounts } from "@/server/pg/sheets";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/google/accounts">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const cfg = googleConfig(appOrigin(request));
    const accounts = await listGoogleAccounts(ws);
    const status: GoogleStatus = { configured: cfg !== null, mode: cfg?.mode ?? null, pickerKey: cfg?.pickerKey ?? null, appId: cfg?.appId ?? null, accounts };
    return Response.json(status);
  });
}
