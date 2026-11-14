import { clientAddress, isProduction, startDevSession } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { findLogin } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";
import { loginSchema } from "@/server/schemas";

// Geliştirme sağlayıcısı kimlik doğrulamaz: e-posta kayıtlıysa oturum açılır. Üretimde Supabase Auth bağlanana kadar kapalıdır.
export async function POST(request: Request) {
  return handle(async () => {
    if (isProduction()) throw new DataError(503, "auth_unavailable", "sign-in is not connected yet");
    if (!allowRequest(`login:${clientAddress(request)}`, 20, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, loginSchema);
    const found = await findLogin(input.email);
    // Hangi adresin kayıtlı olduğu belli olmasın: tek ileti.
    if (!found || !found.slug) throw new DataError(401, "invalid_login", "email or password is wrong");
    await startDevSession(found.userId);
    return Response.json({ redirect: `/w/${found.slug}/pipelines` });
  });
}
