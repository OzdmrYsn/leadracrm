// Google bağlantısının ayarı. Anahtarlar tanımlıysa gerçek Google uçları kullanılır. Tanımlı değilse ve
// üretimde değilsek aynı sunucudaki taklit (api/dev/google) kullanılır: akışın tamamı yerelde denenebilir.
import { isProduction } from "../auth";

export type GoogleConfig = {
  mode: "live" | "dev";
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  driveBase: string;
  sheetsBase: string;
  /** Google dosya seçicisi için tarayıcı anahtarı ve proje numarası (yalnız gerçek kipte). */
  pickerKey: string | null;
  appId: string | null;
};

/** Yalnız kullanıcının seçtiği dosyalara erişim. Hassas ya da kısıtlı izin istenmez. */
export const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/drive.file";

export function googleConfig(origin: string): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return {
      mode: "live",
      clientId,
      clientSecret,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      driveBase: "https://www.googleapis.com/drive/v3",
      sheetsBase: "https://sheets.googleapis.com/v4/spreadsheets",
      pickerKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY || null,
      appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID || null,
    };
  }
  if (isProduction()) return null;
  const fake = `${origin}/api/dev/google`;
  return {
    mode: "dev",
    clientId: "dev-client",
    clientSecret: "dev-secret",
    authUrl: `${fake}/auth`,
    tokenUrl: `${fake}/token`,
    userinfoUrl: `${fake}/userinfo`,
    driveBase: `${fake}/drive`,
    sheetsBase: `${fake}/sheets`,
    pickerKey: null,
    appId: null,
  };
}

/** Uygulamanın dışarıdan görünen adresi: yönlendirme ve bildirim adresleri buna göre kurulur. */
export function appOrigin(request: Request): string {
  return process.env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
}

/** Google değişiklik bildirimi yalnız herkese açık HTTPS adrese gönderir; taklit yerel adrese de gönderir. */
export function hookAddress(cfg: GoogleConfig, origin: string): string | null {
  if (cfg.mode === "dev" || origin.startsWith("https://")) return `${origin}/api/google/drive-hook`;
  return null;
}
