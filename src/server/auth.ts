// Oturum. Uygulamanın kendi şifreli girişi: şifre scrypt özetiyle saklanır (password.ts), oturum rastgele bir
// belirteçtir; çerezde düz, veritabanında yalnız SHA-256 özeti durur. Çerez http-only ve SameSite=Lax'tır.
//
// Geliştirme kolaylığı: üretim dışında, gerçek oturum yokken "ysc-dev-user" çerezindeki kullanıcı (o da yoksa örnek
// verideki yönetici) oturum açmış sayılır. Uçtan uca testler buna dayanır. Üretimde bu yol hiçbir koşulda çalışmaz.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { isProduction } from "./env";
import { isUuid } from "./errors";
import { mailerAvailable } from "./mail";

export { isProduction };

/** Gerçek oturumu taşıyan çerez. */
export const SESSION_COOKIE = "leadra_session";
/** Geliştirmede oturumu taşıyan çerez. Üretimde okunmaz. */
export const DEV_USER_COOKIE = "ysc-dev-user";

/**
 * Geliştirmede bu çerez varsa geliştirme kolaylığı kapanır: yalnız gerçek oturum geçerlidir (üretimdeki davranış).
 * Uçtan uca testler çıkışın, süresi dolan oturumun ve şifre sıfırlamanın oturumu gerçekten kapattığını bununla sınar.
 */
export const DEV_STRICT_COOKIE = "ysc-dev-strict";

/** Örnek verideki yönetici (supabase/seed.sql, "u-ada"). Geliştirmede hiçbir çerez yoksa oturum budur. */
export const DEMO_ADMIN_ID = "bcff588f-b12e-5a2d-a12e-8710933dbabf";

const SESSION_DAYS = 30;
const DAY_MS = 86_400_000;

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Kayıt ve giriş açık mı. Üretimde iki şey gerekir: oturum ve belirteçlerin güvenliği için uygulama sırrı (APP_SECRET)
 * ve doğrulama, şifre sıfırlama, davet iletilerini gönderecek bir postacı. Biri eksikse kayıt ve giriş kapalı kalır.
 */
export function authAvailable(): boolean {
  if (!isProduction()) return true;
  return (process.env.APP_SECRET?.length ?? 0) >= 32 && mailerAvailable();
}

/** Çerezdeki belirtecin sahibini bulur; süresi dolmuşsa null. Bir saatten eski "son görülme" tazelenir ve süre uzar. */
async function sessionUser(token: string): Promise<string | null> {
  const [row] = await db()<Array<{ userId: string; stale: boolean }>>`
    select user_id, last_seen_at < now() - interval '1 hour' as stale
    from user_sessions where token_hash = ${digest(token)} and expires_at > now()`;
  if (!row) return null;
  if (row.stale) {
    await db()`
      update user_sessions set last_seen_at = now(), expires_at = now() + make_interval(days => ${SESSION_DAYS})
      where token_hash = ${digest(token)}`;
  }
  return row.userId;
}

/** Oturum açmış kullanıcının kimliğini döndürür; yoksa null. */
export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const userId = await sessionUser(token);
    if (userId) return userId;
  }
  if (isProduction() || jar.has(DEV_STRICT_COOKIE)) return null;
  const value = jar.get(DEV_USER_COOKIE)?.value;
  return isUuid(value) ? value : DEMO_ADMIN_ID;
}

/** Yeni bir oturum açar ve çerezi yazar. */
export async function startSession(userId: string, request?: Request): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const agent = request?.headers.get("user-agent")?.slice(0, 300) ?? null;
  await db()`
    insert into user_sessions (user_id, token_hash, user_agent, expires_at)
    values (${userId}, ${digest(token)}, ${agent}, now() + make_interval(days => ${SESSION_DAYS}))`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: isProduction(), path: "/", maxAge: (SESSION_DAYS * DAY_MS) / 1000 });
  // Gerçek oturum açılınca geliştirme çerezi kalmasın: iki kimlik karışmasın.
  jar.delete(DEV_USER_COOKIE);
}

/** Bu tarayıcıdaki oturumu kapatır. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from user_sessions where token_hash = ${digest(token)}`;
  jar.delete(SESSION_COOKIE);
  jar.delete(DEV_USER_COOKIE);
}

/** Kullanıcının bütün oturumlarını kapatır (şifre değişince, "her yerden çık" denince). */
export async function endAllSessions(userId: string): Promise<void> {
  await db()`delete from user_sessions where user_id = ${userId}`;
}

/** Hız sınırı anahtarı için istemcinin adresi. Vekil sunucunun yazdığı ilk adres alınır; yoksa hepsi tek kovaya düşer. */
export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
