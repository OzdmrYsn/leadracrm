import { timingSafeEqual } from "node:crypto";
import { isProduction } from "@/server/auth";
import { DataError } from "@/server/errors";
import { appOrigin, googleConfig, hookAddress } from "@/server/google/config";
import { handle } from "@/server/http";
import { syncAllLinks } from "@/server/pg/sheets";

// Zamanlanmış iş (dakikada bir çağrılması önerilir): bağlı tabloları yoklar ve bildirim kanallarını yeniler.
// Üretimde CRON_SECRET ile korunur: "Authorization: Bearer <CRON_SECRET>".
export async function POST(request: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (isProduction() || secret) {
      const given = Buffer.from(request.headers.get("authorization") ?? "");
      const expected = Buffer.from(`Bearer ${secret ?? ""}`);
      if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) throw new DataError(401, "unauthenticated", "missing or wrong job secret");
    }
    const origin = appOrigin(request);
    const cfg = googleConfig(origin);
    if (!cfg) return Response.json({ links: 0, created: 0, renewed: 0 });
    return Response.json(await syncAllLinks(cfg, hookAddress(cfg, origin)));
  });
}
