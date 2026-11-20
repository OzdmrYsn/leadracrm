import { retryMessage } from "@/server/data";
import { handle } from "@/server/http";
import { appOrigin } from "@/server/origin";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/conversations/[conversationId]/messages/[messageId]/retry">) {
  return handle(async () => {
    const { ws, conversationId, messageId } = await ctx.params;
    return Response.json(await retryMessage(ws, conversationId, messageId, appOrigin(request)));
  });
}
