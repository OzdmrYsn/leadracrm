import { DataError, receiveChannelWebhook } from "@/server/data";
import { handle } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";

// Herkese açık uç: Telegram bot güncellemelerini buraya gönderir. Oturum yoktur; koruma, bağlanırken Telegram'a
// bildirilen gizli değerdir (X-Telegram-Bot-Api-Secret-Token başlığı). Gövde boyutu ve istek hızı sınırlıdır.
const MAX_BODY_BYTES = 256 * 1024;
const PER_MINUTE = 600;

export async function POST(request: Request, ctx: RouteContext<"/api/hooks/telegram/[channelId]">) {
  return handle(async () => {
    const { channelId } = await ctx.params;
    if (!allowRequest(`hook:telegram:${channelId}`, PER_MINUTE, 60_000)) {
      return Response.json({ error: { code: "rate_limited", message: "too many requests" } }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const text = await request.text();
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new DataError(413, "too_large", "body is larger than 256 KB");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new DataError(400, "bad_json", "request body is not valid JSON");
    }
    await receiveChannelWebhook("telegram", channelId, request.headers.get("x-telegram-bot-api-secret-token"), body);
    return Response.json({ ok: true });
  });
}
