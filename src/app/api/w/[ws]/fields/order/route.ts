import { z } from "zod";
import { reorderFields } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ entityType: z.enum(["lead", "contact", "company"]), fieldIds: z.array(z.string().min(1)).min(1).max(100) });

export async function PUT(request: Request, ctx: RouteContext<"/api/w/[ws]/fields/order">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const input = await readBody(request, schema);
    return Response.json(await reorderFields(ws, input.entityType, input.fieldIds));
  });
}
