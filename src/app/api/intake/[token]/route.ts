import { createHash } from "node:crypto";
import { DataError, noteIntakeError, receiveIntake } from "@/server/data";
import { handle } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";

// Herkese açık uç: dış sistemler (Google Sheets betiği, Zapier/Make, müşterinin sistemi) buraya lead gönderir.
// Oturum yoktur; tek koruma adresteki gizli anahtardır. Bu yüzden gövde boyutu ve istek hızı sınırlıdır.
const MAX_BODY_BYTES = 64 * 1024;
const PER_MINUTE = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/intake/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    // Sayaç anahtarı adresin özetidir; gizli anahtar bellekte düz hâliyle tutulmaz.
    const key = createHash("sha256").update(token).digest("hex");
    if (!allowRequest(`intake:${key}`, PER_MINUTE, 60_000)) {
      return Response.json({ error: { code: "rate_limited", message: "too many requests" } }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new DataError(413, "too_large", "body is larger than 64 KB");
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new DataError(400, "bad_json", "request body is not valid JSON");
    }
    try {
      const result = await receiveIntake(token, payload);
      return Response.json(result, { status: result.created ? 201 : 200 });
    } catch (error) {
      // Kapı bulunduysa reddetme nedeni ekranda görünsün; bulunamadıysa güncellenecek satır da yoktur.
      if (error instanceof DataError && error.status !== 404) await noteIntakeError(token, error.message);
      throw error;
    }
  });
}
