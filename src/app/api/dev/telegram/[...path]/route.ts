import { isProduction } from "@/server/auth";
import { fakeTelegram } from "@/server/channels/fake-telegram";
import { usesFakeTelegram } from "@/server/channels/telegram";
import { handle } from "@/server/http";

// Yalnız geliştirme: Telegram taklidi. Üretimde ve TELEGRAM_API_URL tanımlıyken kapalıdır.
async function serve(request: Request, ctx: RouteContext<"/api/dev/telegram/[...path]">) {
  return handle(async () => {
    if (isProduction() || !usesFakeTelegram()) return new Response(null, { status: 404 });
    const { path } = await ctx.params;
    return fakeTelegram(request, path);
  });
}

export const GET = serve;
export const POST = serve;
