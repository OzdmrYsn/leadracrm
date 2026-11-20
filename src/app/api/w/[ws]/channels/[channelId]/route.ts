import { disconnectChannel } from "@/server/data";
import { handle } from "@/server/http";
import { appOrigin } from "@/server/origin";

export async function DELETE(request: Request, ctx: RouteContext<"/api/w/[ws]/channels/[channelId]">) {
  return handle(async () => {
    const { ws, channelId } = await ctx.params;
    await disconnectChannel(ws, channelId, appOrigin(request));
    return new Response(null, { status: 204 });
  });
}
