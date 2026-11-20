// Yalnız geliştirme: Telegram Bot API'nin küçük bir taklidi. Gerçek bir bot olmadan "belirteci gir, mesaj al, yanıtla"
// akışının tamamı bununla denenir. Durum bu sürecin belleğindedir. Üretimde bu dosyaya giden yol kapalıdır.
import { TELEGRAM_TOKEN } from "./telegram";

type FakeBot = {
  id: number;
  username: string;
  webhook: { url: string; secret: string } | null;
  sent: Array<{ chatId: string; text: string; messageId: number }>;
  blocked: Set<string>;
  nextMessage: number;
  nextUpdate: number;
};
type FakeState = { bots: Map<string, FakeBot>; down: boolean };

const globalFake = globalThis as typeof globalThis & { __yscFakeTelegram?: FakeState };
const state = () => (globalFake.__yscFakeTelegram ??= { bots: new Map(), down: false });

export function resetFakeTelegram(): void {
  globalFake.__yscFakeTelegram = { bots: new Map(), down: false };
}

const ok = (result: unknown) => Response.json({ ok: true, result });
const fail = (code: number, description: string) => Response.json({ ok: false, error_code: code, description }, { status: code });

/** Belirteç biçime uyuyorsa bot vardır; gizli parçası "GECERSIZ" ile başlayanlar bilerek reddedilir. */
function botOf(token: string): FakeBot | null {
  if (!TELEGRAM_TOKEN.test(token) || token.split(":")[1].startsWith("GECERSIZ")) return null;
  const bots = state().bots;
  let bot = bots.get(token);
  if (!bot) {
    const id = Number(token.split(":")[0]);
    bot = { id, username: `deneme_${id}_bot`, webhook: null, sent: [], blocked: new Set(), nextMessage: 100, nextUpdate: 5000 };
    bots.set(token, bot);
  }
  return bot;
}

async function method(token: string, name: string, body: Record<string, unknown>): Promise<Response> {
  if (state().down) return fail(502, "Bad Gateway");
  const bot = botOf(token);
  if (!bot) return fail(401, "Unauthorized");
  switch (name.toLowerCase()) {
    case "getme":
      return ok({ id: bot.id, is_bot: true, first_name: "Deneme Botu", username: bot.username });
    case "setwebhook": {
      const url = String(body.url ?? "");
      if (!url) {
        bot.webhook = null;
        return ok(true);
      }
      const secret = String(body.secret_token ?? "");
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) return fail(400, "Bad Request: secret token contains unallowed characters");
      bot.webhook = { url, secret };
      return ok(true);
    }
    case "deletewebhook":
      bot.webhook = null;
      return ok(true);
    case "sendmessage": {
      const chatId = String(body.chat_id ?? "");
      const text = String(body.text ?? "");
      if (!chatId) return fail(400, "Bad Request: chat_id is empty");
      if (text.length < 1 || text.length > 4096) return fail(400, "Bad Request: message text is empty or too long");
      if (bot.blocked.has(chatId)) return fail(403, "Forbidden: bot was blocked by the user");
      const messageId = bot.nextMessage++;
      bot.sent.push({ chatId, text, messageId });
      return ok({ message_id: messageId, date: Math.floor(Date.now() / 1000), chat: { id: Number(chatId), type: "private" }, text });
    }
    default:
      return fail(404, "Not Found");
  }
}

type Control = {
  token?: string;
  action: "message" | "block" | "unblock" | "sent" | "webhook" | "down" | "up";
  chatId?: string | number;
  firstName?: string;
  lastName?: string;
  text?: string;
  /** Aynı güncellemeyi ikinci kez göndermek için. */
  updateId?: number;
  /** Yanlış gizli başlığı denemek için. */
  secret?: string;
  /** Grup sohbeti gibi gönderir (bot bunları atlamalıdır). */
  group?: boolean;
  /** Metin yerine fotoğraf gönderir. */
  photo?: boolean;
};

/** Testlerin kullandığı uç: bir kullanıcı bota yazmış gibi yapar, giden mesajları okur, hizmeti kapatıp açar. */
async function control(input: Control): Promise<Response> {
  if (input.action === "down" || input.action === "up") {
    state().down = input.action === "down";
    return Response.json({ down: state().down });
  }
  const bot = input.token ? botOf(input.token) : null;
  if (!bot) return Response.json({ error: "unknown bot" }, { status: 404 });
  const chatId = String(input.chatId ?? "900100");
  if (input.action === "block" || input.action === "unblock") {
    if (input.action === "block") bot.blocked.add(chatId);
    else bot.blocked.delete(chatId);
    return Response.json({ blocked: [...bot.blocked] });
  }
  if (input.action === "sent") return Response.json({ sent: bot.sent });
  if (input.action === "webhook") return Response.json({ webhook: bot.webhook ? { url: bot.webhook.url } : null });
  if (!bot.webhook) return Response.json({ error: "no webhook" }, { status: 409 });
  const updateId = input.updateId ?? bot.nextUpdate++;
  const from = { id: Number(chatId), is_bot: false, first_name: input.firstName ?? "Deniz", last_name: input.lastName, language_code: "tr" };
  const update = {
    update_id: updateId,
    message: {
      message_id: bot.nextMessage++,
      from,
      chat: { id: Number(chatId), type: input.group ? "group" : "private", first_name: from.first_name, last_name: from.last_name },
      date: Math.floor(Date.now() / 1000),
      ...(input.photo ? { photo: [{ file_id: "dev", width: 90, height: 90 }], caption: input.text } : { text: input.text ?? "Merhaba" }),
    },
  };
  const response = await fetch(bot.webhook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": input.secret ?? bot.webhook.secret },
    body: JSON.stringify(update),
  });
  return Response.json({ status: response.status, updateId });
}

export async function fakeTelegram(request: Request, path: string[]): Promise<Response> {
  const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
  if (path[0] === "control") return control(body as unknown as Control);
  const [first, name] = path;
  if (!first?.startsWith("bot") || !name) return fail(404, "Not Found");
  return method(decodeURIComponent(first.slice(3)), name, body);
}
