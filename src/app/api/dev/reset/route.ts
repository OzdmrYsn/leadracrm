import { cookies } from "next/headers";
import { z } from "zod";
import { DEMO_ADMIN_ID, DEV_STRICT_COOKIE, DEV_USER_COOKIE, isProduction, SESSION_COOKIE } from "@/server/auth";
import { resetDevOutbox } from "@/server/mail";
import { handle, readBody } from "@/server/http";
import { resetDatabase } from "@/server/pg/dev";
import { resetFakeBilling } from "@/server/billing/dev-provider";
import { resetFakeTelegram } from "@/server/channels/fake-telegram";
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
    resetFakeTelegram();
    resetFakeBilling();
    resetDevOutbox();
    resetGoogleTokens();
    const jar = await cookies();
    // Veri silindiği için gerçek oturum da geçersizdir.
    jar.delete(SESSION_COOKIE);
    jar.delete(DEV_STRICT_COOKIE);
    if (input.userId) jar.set(DEV_USER_COOKIE, input.userId, { httpOnly: true, sameSite: "lax", path: "/" });
    else jar.delete(DEV_USER_COOKIE);
    return Response.json({ ok: true, userId: input.userId ?? DEMO_ADMIN_ID });
  });
}
