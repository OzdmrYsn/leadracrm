import { z } from "zod";
import { clientAddress } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { resetPassword } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(200) });

// Bağlantıdaki belirteçle yeni şifre. Belirteç tek kullanımlıktır ve bir saat geçerlidir; bütün oturumlar kapanır.
export async function POST(request: Request) {
  return handle(async () => {
    if (!allowRequest(`reset:${clientAddress(request)}`, 10, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, schema);
    if (!(await resetPassword(input.token, input.password))) throw new DataError(410, "link_invalid", "reset link is invalid or expired");
    return Response.json({ redirect: "/login?reset=1" });
  });
}
