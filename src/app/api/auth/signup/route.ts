import { authAvailable, clientAddress, startSession } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { sendMail, verifyMail } from "@/server/mail";
import { appOrigin } from "@/server/origin";
import { createAccount } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";
import { signupSchema } from "@/server/schemas";

// Hesap ve ilk çalışma alanı. Şifre yalnız özeti alınarak saklanır; oturum hemen açılır ve doğrulama iletisi gönderilir.
// Üretimde uygulama sırrı ve postacı tanımlı değilse kapalıdır.
export async function POST(request: Request) {
  return handle(async () => {
    if (!authAvailable()) throw new DataError(503, "auth_unavailable", "sign-up is not configured");
    if (!allowRequest(`signup:${clientAddress(request)}`, 10, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, signupSchema);
    const account = await createAccount({ name: input.name, email: input.email, password: input.password, workspaceName: input.workspaceName });
    await startSession(account.userId, request);
    // İleti gönderilemese de hesap açılmıştır; kullanıcı doğrulama iletisini sonra yeniden isteyebilir.
    const link = `${appOrigin(request)}/verify?token=${account.verifyToken}`;
    await sendMail(verifyMail(account.email, input.name.trim(), link)).catch(() => undefined);
    return Response.json({ redirect: `/w/${account.slug}/pipelines` }, { status: 201 });
  });
}
