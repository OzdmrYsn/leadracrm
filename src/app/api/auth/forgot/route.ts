import { clientAddress } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";
import { forgotSchema } from "@/server/schemas";

// Şifre sıfırlama e-postası kimlik sağlayıcısı ve e-posta gönderimi bağlanınca gönderilir. O zamana kadar
// istek doğrulanır ve hiçbir şey gönderilmediği açıkça söylenir.
export async function POST(request: Request) {
  return handle(async () => {
    if (!allowRequest(`forgot:${clientAddress(request)}`, 5, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    await readBody(request, forgotSchema);
    return Response.json({ sent: false });
  });
}
