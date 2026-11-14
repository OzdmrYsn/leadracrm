// OAuth "state" değeri: isteği başlatan tarayıcıya ve çalışma alanına bağlar (CSRF koruması).
import { randomBytes } from "node:crypto";
import { sign, verify } from "../secret-box";

export const STATE_COOKIE = "ysc-g-state";

export function newState(ws: string): { state: string; nonce: string } {
  const nonce = randomBytes(18).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ws, nonce, exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  return { state: `${body}.${sign(body)}`, nonce };
}

/** İmza, süre ve çerezdeki değer tutuyorsa çalışma alanını döndürür. */
export function readState(state: string | null, cookieNonce: string | undefined): string | null {
  const [body, signature] = (state ?? "").split(".");
  if (!body || !signature || !verify(body, signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { ws: string; nonce: string; exp: number };
    if (parsed.exp < Date.now() || !cookieNonce || parsed.nonce !== cookieNonce) return null;
    return /^[a-z0-9-]{3,40}$/.test(parsed.ws) ? parsed.ws : null;
  } catch {
    return null;
  }
}
