import { z } from "zod";
import { bulkLeads } from "@/server/data";
import { handle, readBody } from "@/server/http";

const id = z.string().min(1).max(64);

// Bir istekte en çok 200 lead: işlem isteğin içinde, lead başına ayrı ayrı (yetki denetimi ve tetikleyicilerle) uygulanır.
const schema = z.object({
  ids: z.array(id).min(1).max(200),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("responsible"), userId: id.nullable() }),
    z.object({ kind: z.literal("stage"), stageId: id }),
    z.object({ kind: z.literal("tags"), add: z.array(id).max(50).default([]), remove: z.array(id).max(50).default([]) }),
    z.object({ kind: z.literal("delete") }),
  ]),
});

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/leads/bulk">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { ids, action } = await readBody(request, schema);
    return Response.json(await bulkLeads(ws, ids, action));
  });
}
