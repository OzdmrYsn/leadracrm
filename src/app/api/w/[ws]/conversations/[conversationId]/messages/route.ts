import { z } from "zod";
import { listMessages, sendMessage } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { appOrigin } from "@/server/origin";

const sendSchema = z.object({ clientToken: z.uuid(), body: z.string().trim().min(1).max(4096) });

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/conversations/[conversationId]/messages">) {
  return handle(async () => {
    const { ws, conversationId } = await ctx.params;
    return Response.json(await listMessages(ws, conversationId));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/conversations/[conversationId]/messages">) {
  return handle(async () => {
    const { ws, conversationId } = await ctx.params;
    return Response.json(await sendMessage(ws, conversationId, await readBody(request, sendSchema), appOrigin(request)), { status: 201 });
  });
}
