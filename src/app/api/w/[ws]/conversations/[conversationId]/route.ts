import { assignConversation, setConversationStatus } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { conversationPatchSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/conversations/[conversationId]">) {
  return handle(async () => {
    const { ws, conversationId } = await ctx.params;
    const input = await readBody(request, conversationPatchSchema);
    if ("status" in input) return Response.json(await setConversationStatus(ws, conversationId, input.status));
    return Response.json(await assignConversation(ws, conversationId, input.assignedUserId));
  });
}
