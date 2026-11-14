import { cookies } from "next/headers";
import { z } from "zod";
import { DEMO_ADMIN_ID, DEV_USER_COOKIE, isProduction } from "@/server/auth";
import { handle, readBody } from "@/server/http";
import { resetDatabase } from "@/server/pg/dev";
import { resetFakeGoogle } from "@/server/google/fake";
import { resetGoogleTokens } from "@/server/pg/sheets";
import { resetRateLimits } from "@/server/rate-limit";

// Yalnız geliştirme: yerel veritabanını örnek veriye döndürür. Uçtan uca testler her testten önce çağırır.
// userId verilirse geliştirme oturumu o kullanıcıya geçer (yönetici olmayan görünümü sınamak için).
const schema = z.object({ userId: z.uuid().optional() });

export async function POST(request: Request) {
  return handle(async () => {
    if (isProduction()) return new Response(null, { status: 404 });
    const input = await readBody(request, schema);
    await resetDatabase();
    resetRateLimits();
    resetFakeGoogle();
    resetGoogleTokens();
    const jar = await cookies();
    if (input.userId) jar.set(DEV_USER_COOKIE, input.userId, { httpOnly: true, sameSite: "lax", path: "/" });
    else jar.delete(DEV_USER_COOKIE);
    return Response.json({ ok: true, userId: input.userId ?? DEMO_ADMIN_ID });
  });
}
