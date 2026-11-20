import { clientAddress } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { mailerAvailable, resetMail, sendMail } from "@/server/mail";
import { appOrigin } from "@/server/origin";
import { requestPasswordReset } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";
import { forgotSchema } from "@/server/schemas";

// Şifre sıfırlama bağlantısı. Adres kayıtlı olsa da olmasa da yanıt aynıdır. Postacı yoksa bu açıkça söylenir.
export async function POST(request: Request) {
  return handle(async () => {
    if (!allowRequest(`forgot:${clientAddress(request)}`, 5, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, forgotSchema);
    if (!mailerAvailable()) return Response.json({ sent: false });
    const found = await requestPasswordReset(input.email);
    if (found) await sendMail(resetMail(found.email, found.name, `${appOrigin(request)}/reset?token=${found.token}`)).catch(() => undefined);
    return Response.json({ sent: true });
  });
}
