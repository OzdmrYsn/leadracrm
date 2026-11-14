import { appOrigin, googleConfig } from "@/server/google/config";
import { handle } from "@/server/http";
import { handleDriveNotification } from "@/server/pg/sheets";
import { allowRequest } from "@/server/rate-limit";

// Google Drive değişiklik bildirimi. Gövde boştur; hangi dosyanın değiştiği başlıklardaki kanal kimliğinden anlaşılır.
// Kanalın gizli anahtarı tutmuyorsa hiçbir şey yapılmaz. Yanıt her durumda 200'dür: Google yeniden denemesin.
export async function POST(request: Request) {
  return handle(async () => {
    const channelId = request.headers.get("x-goog-channel-id");
    const cfg = googleConfig(appOrigin(request));
    if (cfg && channelId && allowRequest(`drive-hook:${channelId}`, 120, 60_000)) {
      await handleDriveNotification({ channelId, token: request.headers.get("x-goog-channel-token"), state: request.headers.get("x-goog-resource-state") }, cfg);
    }
    return new Response(null, { status: 200 });
  });
}
