import { clientAddress, isProduction, startDevSession } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { createAccount } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";
import { signupSchema } from "@/server/schemas";

// Hesap ve ilk çalışma alanı. Şimdilik yalnız geliştirme sağlayıcısıyla çalışır: şifre saklanmaz ve doğrulanmaz.
// Üretimde Supabase Auth bağlanana kadar kapalıdır.
export async function POST(request: Request) {
  return handle(async () => {
    if (isProduction()) throw new DataError(503, "auth_unavailable", "sign-up is not connected yet");
    if (!allowRequest(`signup:${clientAddress(request)}`, 10, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, signupSchema);
    const account = await createAccount({ name: input.name, email: input.email, workspaceName: input.workspaceName });
    await startDevSession(account.userId);
    return Response.json({ redirect: `/w/${account.slug}/pipelines` }, { status: 201 });
  });
}
