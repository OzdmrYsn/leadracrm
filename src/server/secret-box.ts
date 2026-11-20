// Dış hizmet anahtarlarını (ör. Google yenileme anahtarı) veritabanında şifreli saklamak ve kısa ömürlü
// değerleri imzalamak için. Anahtar APP_SECRET ortam değişkeninden türetilir.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isProduction } from "./env";
import { DataError } from "./errors";

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (secret && secret.length >= 32) return createHash("sha256").update(secret).digest();
  // Üretimde sır yoksa hiçbir şey şifrelenmez: özellik kapalı kalır.
  if (isProduction()) throw new DataError(503, "not_configured", "APP_SECRET is not set");
  return createHash("sha256").update("yalnizca-yerel-gelistirme-anahtari").digest();
}

/** AES-256-GCM ile şifreler: "v1.<iv>.<etiket>.<veri>" (base64url). */
export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function unseal(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("unknown sealed value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function sign(value: string): string {
  return createHmac("sha256", key()).update(value).digest("base64url");
}

export function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
