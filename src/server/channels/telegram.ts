// Telegram Bot API adaptörü (https://core.telegram.org/bots/api). Yönetici @BotFather'dan aldığı belirteci girer;
// belirteç getMe ile doğrulanır, setWebhook ile bildirim adresi kurulur. Bildirimler gizli başlıkla gelir.
// Bot yalnız birebir sohbetleri dinler; gruplardaki mesajlar atlanır.
import { isProduction } from "../auth";
import { callService, ChannelError, type ChannelAdapter, type InboundEvent } from "./types";

/**
 * API'nin adresi. TELEGRAM_API_URL verilmişse o kullanılır. Verilmemişse üretimde gerçek adres, geliştirmede aynı
 * sunucudaki taklit (api/dev/telegram): böylece geliştirme ortamı kendiliğinden gerçek hizmete istek atmaz.
 */
export function telegramApiBase(origin: string): string {
  const custom = process.env.TELEGRAM_API_URL?.replace(/\/+$/, "");
  if (custom) return custom;
  return isProduction() ? "https://api.telegram.org" : `${origin}/api/dev/telegram`;
}

export const usesFakeTelegram = () => !isProduction() && !process.env.TELEGRAM_API_URL;

/** Belirteç biçimi: "<bot kimliği>:<gizli parça>". */
export const TELEGRAM_TOKEN = /^\d{3,}:[A-Za-z0-9_-]{20,}$/;

type Envelope<T> = { ok: boolean; result?: T; error_code?: number; description?: string };
type TgUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: unknown;
  document?: unknown;
  voice?: unknown;
  sticker?: unknown;
  contact?: unknown;
  location?: unknown;
  video?: unknown;
};
type TgUpdate = { update_id: number; message?: TgMessage };

async function call<T>(origin: string, token: string, method: string, body?: unknown): Promise<T> {
  const response = await callService(`${telegramApiBase(origin)}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let data: Envelope<T> | null = null;
  try {
    data = (await response.json()) as Envelope<T>;
  } catch {
    data = null;
  }
  if (response.ok && data?.ok && data.result !== undefined) return data.result;
  const code = data?.error_code ?? response.status;
  if (code === 401 || code === 404) throw new ChannelError("unauthorized", data?.description);
  if (code === 403) throw new ChannelError("recipient_blocked", data?.description);
  if (code === 429) throw new ChannelError("rate_limited", data?.description);
  if (code >= 500) throw new ChannelError("unreachable", data?.description);
  throw new ChannelError("rejected", data?.description);
}

/** Metni olmayan mesajlar için kısa bir yer tutucu: dosyalar henüz gösterilmiyor. */
function placeholder(message: TgMessage): string | null {
  if (message.photo) return "[Fotoğraf]";
  if (message.video) return "[Video]";
  if (message.voice) return "[Sesli mesaj]";
  if (message.document) return "[Dosya]";
  if (message.sticker) return "[Çıkartma]";
  if (message.location) return "[Konum]";
  if (message.contact) return "[Kişi kartı]";
  return null;
}

export const telegram: ChannelAdapter<{ token: string }> = {
  kind: "telegram",

  async identify({ token }, origin) {
    if (!TELEGRAM_TOKEN.test(token)) throw new ChannelError("invalid_credentials");
    let me: TgUser;
    try {
      me = await call<TgUser>(origin, token, "getMe");
    } catch (error) {
      if (error instanceof ChannelError && error.code === "unauthorized") throw new ChannelError("invalid_credentials");
      throw error;
    }
    return {
      externalAccountId: String(me.id),
      name: me.username ? `@${me.username}` : (me.first_name ?? "Telegram"),
      credentials: { token },
    };
  },

  async subscribe(credentials, { webhookUrl, secret, origin }) {
    // Gerçek Telegram bildirimi yalnız herkese açık HTTPS adrese gönderir.
    if (!usesFakeTelegram() && !webhookUrl.startsWith("https://")) throw new ChannelError("needs_public_url");
    await call<boolean>(origin, credentials.token, "setWebhook", { url: webhookUrl, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
  },

  async disconnect(credentials, origin) {
    await call<boolean>(origin, credentials.token, "deleteWebhook", {});
  },

  parse(body) {
    const update = body as TgUpdate;
    if (!update || typeof update.update_id !== "number") return [];
    const message = update.message;
    if (!message || message.chat?.type !== "private" || message.from?.is_bot) return [];
    const text = [placeholder(message), message.text ?? message.caption].filter(Boolean).join(" ").trim();
    if (!text) return [];
    const person = message.from ?? message.chat;
    const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || (person.username ? `@${person.username}` : `Telegram ${message.chat.id}`);
    const event: InboundEvent = {
      type: "message",
      eventId: String(update.update_id),
      chatId: String(message.chat.id),
      contactName: name.slice(0, 200),
      text: text.slice(0, 4096),
      externalMessageId: String(message.message_id),
    };
    return [event];
  },

  async send(credentials, chatId, text, origin) {
    const sent = await call<{ message_id: number }>(origin, credentials.token, "sendMessage", { chat_id: chatId, text });
    return { externalMessageId: sent?.message_id !== undefined ? String(sent.message_id) : null };
  },
};
