import { markConversationRead } from "@/server/data";
import { handle } from "@/server/http";

export async function POST(_request: Request, ctx: RouteContext<"/api/w/[ws]/conversations/[conversationId]/read">) {
  return handle(async () => {
    const { ws, conversationId } = await ctx.params;
    await markConversationRead(ws, conversationId);
    return new Response(null, { status: 204 });
  });
}
