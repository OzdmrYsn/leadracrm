// Kanal adaptörü: bir mesajlaşma hizmetiyle konuşmanın tek yolu. Her kanal aynı üç işi yapar:
// anahtarı doğrulayıp bildirim adresini kurar, gelen bildirimi olaylara çevirir, mesaj gönderir.
// Adaptörler yalnız hizmetin resmî, herkese açık API'sini kullanır; anahtar çalışma alanı yöneticisinindir.
import type { ChannelKind } from "@/lib/types";

/** Kanaldan gelen bir olay. eventId aynı bildirimin ikinci kez işlenmesini önler. */
export type InboundEvent =
  | {
      type: "message";
      eventId: string;
      /** Hizmetin sohbet kimliği: yanıt buraya gönderilir. */
      chatId: string;
      contactName: string;
      text: string;
      externalMessageId: string | null;
    }
  | { type: "status"; eventId: string; externalMessageId: string; status: "sent" | "delivered" | "read" | "failed"; errorCode?: string };

/** Gönderim hatası. code arayüzde okunur bir nedene çevrilir; unauthorized kanalın koptuğu anlamına gelir. */
export type SendFailure = "unauthorized" | "recipient_blocked" | "rate_limited" | "unreachable" | "rejected" | "window_closed";

export class ChannelError extends Error {
  constructor(
    public code: SendFailure | "invalid_credentials" | "needs_public_url",
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

export type ConnectContext = {
  /** Bildirimlerin geleceği adres (kanal kimliğini içerir). */
  webhookUrl: string;
  /** Bildirimle birlikte gelecek gizli değer; adaptör bunu hizmete bildirir. */
  secret: string;
  /** Uygulamanın dışarıdan görünen adresi. */
  origin: string;
};

export type Connected = {
  /** Hizmetteki hesabın kimliği (bot kimliği, numara kimliği, sayfa kimliği). Aynı hesap iki kez bağlanamaz. */
  externalAccountId: string;
  /** Listede görünen ad, örn. "@ornek_bot". */
  name: string;
  /** Şifrelenerek saklanacak anahtarlar. */
  credentials: Record<string, string>;
};

export type ChannelAdapter<Input = Record<string, string>> = {
  kind: ChannelKind;
  /** Anahtarı hizmete sorarak doğrular ve hesabı tanır. Bildirim adresine dokunmaz. */
  identify: (input: Input, origin: string) => Promise<Connected>;
  /** Bildirim adresini kurar. Hesabın başka bir çalışma alanına bağlı olmadığı anlaşıldıktan sonra çağrılır. */
  subscribe: (credentials: Record<string, string>, context: ConnectContext) => Promise<void>;
  /** Bağlantı kesilirken hizmetteki bildirim adresini kaldırır. Hata bağlantıyı kesmeyi engellemez. */
  disconnect: (credentials: Record<string, string>, origin: string) => Promise<void>;
  /** Bildirimin gövdesini olaylara çevirir. Tanımadığı güncellemeleri atlar. */
  parse: (body: unknown) => InboundEvent[];
  /** Metin gönderir; hizmetin verdiği mesaj kimliğini döndürür. Hata ChannelError olarak fırlar. */
  send: (credentials: Record<string, string>, chatId: string, text: string, origin: string) => Promise<{ externalMessageId: string | null }>;
};

/** Dış hizmete istek: 10 saniyede yanıt gelmezse "ulaşılamadı" sayılır. */
export async function callService(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch {
    throw new ChannelError("unreachable");
  }
}
