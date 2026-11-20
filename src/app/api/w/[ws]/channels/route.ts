import { z } from "zod";
import { usesFakeTelegram } from "@/server/channels/telegram";
import { connectChannel, listChannels } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { appOrigin } from "@/server/origin";
import { allowRequest } from "@/server/rate-limit";
import { DataError } from "@/server/errors";

// Kanal türüne göre bağlantı bilgisi. Anahtarlar yalnız bu istekte taşınır; yanıtta ve listede hiç dönmez.
const connectSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("telegram"),
    token: z.string().trim().min(1).max(200),
    pipelineId: z.string().min(1).optional(),
  }),
]);

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/channels">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    // sandbox: kanal türü yerel taklitle çalışıyorsa bağlama penceresi bunu söyler (yalnız geliştirme).
    return Response.json({ items: await listChannels(ws), sandbox: { telegram: usesFakeTelegram() } });
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/channels">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    // Her deneme dış hizmete istek atar: çalışma alanı başına dakikada 10 deneme.
    if (!allowRequest(`channel-connect:${ws}`, 10, 60_000)) throw new DataError(429, "rate_limited");
    const { kind, pipelineId, ...credentials } = await readBody(request, connectSchema);
    return Response.json(await connectChannel(ws, { kind, credentials, pipelineId }, appOrigin(request)), { status: 201 });
  });
}
