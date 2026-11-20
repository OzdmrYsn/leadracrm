import { authAvailable, clientAddress, startSession } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { checkLogin } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";
import { loginSchema } from "@/server/schemas";

// E-posta ve şifreyle giriş. Yanlış e-posta ile yanlış şifre aynı yanıtı alır: hangi adresin kayıtlı olduğu belli olmaz.
// Deneme hızı hem adres hem e-posta başına sınırlıdır.
export async function POST(request: Request) {
  return handle(async () => {
    if (!authAvailable()) throw new DataError(503, "auth_unavailable", "sign-in is not configured");
    if (!allowRequest(`login:${clientAddress(request)}`, 20, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, loginSchema);
    if (!allowRequest(`login-email:${input.email.trim().toLowerCase()}`, 10, 10 * 60_000)) throw new DataError(429, "rate_limited", "too many attempts for this email");
    const found = await checkLogin(input.email, input.password);
    if (!found) throw new DataError(401, "invalid_login", "email or password is wrong");
    // Hesap var ama etkin üyeliği yok (ör. çalışma alanında pasifleştirilmiş).
    if (!found.slug) throw new DataError(403, "no_workspace", "this account has no active workspace");
    await startSession(found.userId, request);
    return Response.json({ redirect: `/w/${found.slug}/pipelines` });
  });
}
