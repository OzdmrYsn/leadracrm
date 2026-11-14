import { DataError } from "@/server/errors";
import { appOrigin, googleConfig } from "@/server/google/config";
import { handle } from "@/server/http";
import { pickerToken } from "@/server/pg/sheets";

// Google dosya seçicisi tarayıcıda çalışır ve kısa ömürlü bir erişim anahtarı ister. Yalnız yöneticiye verilir.
export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/google/accounts/[accountId]/token">) {
  return handle(async () => {
    const { ws, accountId } = await ctx.params;
    const cfg = googleConfig(appOrigin(request));
    if (!cfg) throw new DataError(503, "not_configured", "google connection is not configured");
    return Response.json({ accessToken: await pickerToken(ws, accountId, cfg) }, { headers: { "Cache-Control": "no-store" } });
  });
}
