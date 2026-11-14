import { DataError } from "@/server/errors";
import { appOrigin, googleConfig } from "@/server/google/config";
import { handle } from "@/server/http";
import { pickerToken } from "@/server/pg/sheets";

// Yalnız geliştirme kipinde: taklit Google hesabındaki tabloları listeler. Gerçek kipte liste yoktur;
// kullanıcı tabloyu Google'ın kendi dosya seçicisinden seçer (yalnız seçtiği dosyaya erişiriz).
export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/google/accounts/[accountId]/files">) {
  return handle(async () => {
    const { ws, accountId } = await ctx.params;
    const cfg = googleConfig(appOrigin(request));
    if (!cfg || cfg.mode !== "dev") throw new DataError(404, "not_found", "file listing is only available in development mode");
    const token = await pickerToken(ws, accountId, cfg);
    const response = await fetch(`${cfg.driveBase}/files`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await response.json()) as { files?: Array<{ id: string; name: string }> };
    return Response.json(body.files ?? []);
  });
}
