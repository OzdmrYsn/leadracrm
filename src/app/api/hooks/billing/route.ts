import { billingProvider } from "@/server/billing/provider";
import { applyBillingEvent, DataError } from "@/server/data";
import { handle } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";

// Herkese açık uç: ödeme sağlayıcısı abonelik olaylarını buraya bildirir. Oturum yoktur; koruma bildirimin imzasıdır.
// Abonelik durumu yalnız buradan değişir.
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  return handle(async () => {
    if (!allowRequest("hook:billing", 600, 60_000)) {
      return Response.json({ error: { code: "rate_limited", message: "too many requests" } }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const provider = billingProvider();
    if (!provider) throw new DataError(503, "billing_unavailable");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new DataError(413, "too_large");
    const event = provider.verifyWebhook(raw, request.headers.get("x-billing-signature"));
    if (!event) throw new DataError(401, "unauthorized", "bad signature");
    return Response.json(await applyBillingEvent(provider.id, event));
  });
}
