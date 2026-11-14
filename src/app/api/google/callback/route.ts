import { cookies } from "next/headers";
import { exchangeCode, userInfo } from "@/server/google/client";
import { appOrigin, googleConfig } from "@/server/google/config";
import { readState, STATE_COOKIE } from "@/server/google/state";
import { saveGoogleAccount } from "@/server/pg/sheets";

// Google izin ekranından dönüş. Başarılıysa hesap kaydedilir ve Kaynaklar ekranına dönülür; değilse neden adreste taşınır.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const jar = await cookies();
  const ws = readState(url.searchParams.get("state"), jar.get(STATE_COOKIE)?.value);
  jar.delete({ name: STATE_COOKIE, path: "/api/google" });
  if (!ws) return Response.redirect(`${origin}/login`, 302);
  const back = (query: string) => Response.redirect(`${origin}/w/${ws}/sources?${query}`, 302);

  const cfg = googleConfig(origin);
  const code = url.searchParams.get("code");
  if (!cfg || !code) return back(`google_error=${url.searchParams.get("error") === "access_denied" ? "denied" : "failed"}`);
  try {
    const tokens = await exchangeCode(cfg, code, `${origin}/api/google/callback`);
    // Kullanıcı dosya iznini işaretlemeden devam ettiyse bağlantı işe yaramaz.
    if (!tokens.refreshToken || !tokens.scope.includes("drive.file")) return back("google_error=scope");
    const profile = await userInfo(cfg, tokens.accessToken);
    const accountId = await saveGoogleAccount(ws, { sub: profile.sub, email: profile.email || "Google", refreshToken: tokens.refreshToken, scope: tokens.scope });
    return back(`google=${accountId}`);
  } catch (error) {
    console.error("google callback failed", error instanceof Error ? error.message : error);
    return back("google_error=failed");
  }
}
