// E-posta gönderimi. RESEND_API_KEY ve MAIL_FROM tanımlıysa Resend'in HTTP API'si kullanılır (paket gerekmez).
// Tanımlı değilse ve üretimde değilsek ileti bu sürecin belleğindeki giden kutusuna düşer: doğrulama, şifre sıfırlama
// ve davet akışları yerelde uçtan uca denenebilir. Üretimde postacı yoksa bu akışlar kapalı kalır.
import { tr } from "@/i18n/tr";
import { fill } from "@/i18n/fill";
import { isProduction } from "./env";
import { DataError } from "./errors";

export type Mail = { to: string; subject: string; text: string };
type Sent = Mail & { at: string };

const live = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

/** E-posta gönderilebiliyor mu (gerçek postacı ya da geliştirmedeki giden kutusu). */
export const mailerAvailable = () => live() || !isProduction();
/** Yalnız geliştirme: iletiler gerçek posta yerine giden kutusuna düşüyor. */
export const mailerSandbox = () => !live() && !isProduction();

const globalBox = globalThis as typeof globalThis & { __yscOutbox?: Sent[] };
export const devOutbox = (): Sent[] => (globalBox.__yscOutbox ??= []);
export function resetDevOutbox(): void {
  globalBox.__yscOutbox = [];
}

export async function sendMail(mail: Mail): Promise<void> {
  if (live()) {
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new DataError(502, "mail_failed", "mail service is unreachable");
    }
    if (!response.ok) throw new DataError(502, "mail_failed", `mail service answered ${response.status}`);
    return;
  }
  if (isProduction()) throw new DataError(503, "mail_unavailable", "no mail service is configured");
  devOutbox().push({ ...mail, at: new Date().toISOString() });
}

/* ---------- iletiler ---------- */

const m = tr.mail;
const app = tr.app.name;

export const verifyMail = (to: string, name: string, link: string): Mail => ({
  to,
  subject: fill(m.verify.subject, { app }),
  text: fill(m.verify.text, { name, app, link }),
});

export const resetMail = (to: string, name: string, link: string): Mail => ({
  to,
  subject: fill(m.reset.subject, { app }),
  text: fill(m.reset.text, { name, app, link }),
});

export const inviteMail = (to: string, input: { inviter: string; workspace: string; link: string }): Mail => ({
  to,
  subject: fill(m.invite.subject, { inviter: input.inviter, workspace: input.workspace }),
  text: fill(m.invite.text, { inviter: input.inviter, workspace: input.workspace, app, link: input.link }),
});
