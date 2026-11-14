// Oturumdaki kullanıcının kimliği. Supabase Auth bağlanana kadar yalnız geliştirme sağlayıcısı vardır.
import { cookies } from "next/headers";
import { isUuid } from "./errors";

/** Geliştirmede oturumu taşıyan çerez. Üretimde okunmaz. */
export const DEV_USER_COOKIE = "ysc-dev-user";

/** Örnek verideki yönetici (supabase/seed.sql, "u-ada"). Geliştirmede çerez yoksa oturum budur. */
export const DEMO_ADMIN_ID = "bcff588f-b12e-5a2d-a12e-8710933dbabf";

export const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Oturum açmış kullanıcının kimliğini döndürür; yoksa null.
 * Geliştirme sağlayıcısı kimlik doğrulamaz: çerezdeki kullanıcıyı olduğu gibi kabul eder. Bu yüzden
 * üretim derlemesinde hiçbir koşulda çalışmaz; Supabase Auth bağlanana kadar üretimde oturum açılamaz.
 */
export async function currentUserId(): Promise<string | null> {
  if (isProduction()) return null;
  const jar = await cookies();
  const value = jar.get(DEV_USER_COOKIE)?.value;
  return isUuid(value) ? value : DEMO_ADMIN_ID;
}

/** Geliştirme oturumunu verilen kullanıcıya açar. Üretimde çağrılmaz: orada oturumu Supabase Auth açacak. */
export async function startDevSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(DEV_USER_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_USER_COOKIE);
}

/** Hız sınırı anahtarı için istemcinin adresi. Vekil sunucunun yazdığı ilk adres alınır; yoksa hepsi tek kovaya düşer. */
export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
