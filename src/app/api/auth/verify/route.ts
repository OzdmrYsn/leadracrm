import { z } from "zod";
import { clientAddress } from "@/server/auth";
import { DataError } from "@/server/errors";
import { handle, readBody } from "@/server/http";
import { verifyEmail } from "@/server/pg/accounts";
import { allowRequest } from "@/server/rate-limit";

const schema = z.object({ token: z.string().min(20).max(200) });

// E-posta doğrulama bağlantısı. Belirteç tek kullanımlıktır ve 24 saat geçerlidir.
export async function POST(request: Request) {
  return handle(async () => {
    if (!allowRequest(`verify:${clientAddress(request)}`, 20, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const input = await readBody(request, schema);
    if (!(await verifyEmail(input.token))) throw new DataError(410, "link_invalid", "verification link is invalid or expired");
    return Response.json({ verified: true });
  });
}
