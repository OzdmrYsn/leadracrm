// Şifre özeti: scrypt (node:crypto), kullanıcı başına rastgele tuz. Düz şifre hiçbir yere yazılmaz.
// Biçim: scrypt$<log2 N>$<r>$<p>$<tuz>$<özet> (tuz ve özet base64url). Ayarlar özetle birlikte durur ki
// sonradan güçlendirilebilsin; eski özetler kendi ayarlarıyla doğrulanmaya devam eder.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const LOG_N = 15;
const R = 8;
const P = 1;
const KEY_BYTES = 32;

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Aynı görünen iki yazım (ör. birleşik ve ayrık aksan) aynı şifre sayılsın.
    scrypt(password.normalize("NFKC"), salt, KEY_BYTES, { N: 2 ** logN, r, p, maxmem: 128 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, LOG_N, R, P);
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const [n, rr, pp] = [Number(logN), Number(r), Number(p)];
  // Ayarlar veritabanından gelir; saçma bir değer belleği tüketmesin.
  if (!Number.isInteger(n) || n < 10 || n > 20 || !Number.isInteger(rr) || rr < 1 || rr > 16 || !Number.isInteger(pp) || pp < 1 || pp > 4) return false;
  const key = await derive(password, Buffer.from(salt, "base64url"), n, rr, pp);
  const want = Buffer.from(expected, "base64url");
  return key.length === want.length && timingSafeEqual(key, want);
}

const DUMMY_SALT = Buffer.from("leadra-bos-tuz-0");

/** Kayıtlı olmayan e-postada da aynı süre harcanır: yanıt süresinden hangi adresin kayıtlı olduğu anlaşılmasın. */
export async function burnPassword(password: string): Promise<void> {
  await derive(password, DUMMY_SALT, LOG_N, R, P);
}
