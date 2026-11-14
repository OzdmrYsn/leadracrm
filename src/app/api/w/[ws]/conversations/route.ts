import { listConversations } from "@/server/data";
import { handle } from "@/server/http";

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/conversations">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const params = new URL(request.url).searchParams;
    return Response.json(
      await listConversations(ws, {
        status: params.get("status") === "all" ? "all" : "open",
        query: params.get("q") ?? undefined,
      }),
    );
  });
}
