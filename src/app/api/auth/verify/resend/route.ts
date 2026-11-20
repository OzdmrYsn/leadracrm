import { currentUserId } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle } from "@/server/http";
import { sendMail, verifyMail } from "@/server/mail";
import { appOrigin } from "@/server/origin";
import { reissueVerification } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";

// Oturumdaki kullanıcıya doğrulama iletisini yeniden gönderir. Hesap zaten doğrulanmışsa hiçbir şey gönderilmez.
export async function POST(request: Request) {
  return handle(async () => {
    const userId = await currentUserId();
    if (!userId) throw new DataError(401, "unauthenticated");
    if (!allowRequest(`verify-resend:${userId}`, 3, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const pending = await reissueVerification(userId);
    if (!pending) return Response.json({ sent: false });
    await sendMail(verifyMail(pending.email, pending.name, `${appOrigin(request)}/verify?token=${pending.token}`));
    return Response.json({ sent: true });
  });
}
