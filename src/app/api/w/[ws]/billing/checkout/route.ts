import { z } from "zod";
import { startCheckout } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { appOrigin } from "@/server/origin";

const schema = z.object({ seats: z.number().int().min(1).max(500), period: z.enum(["month", "year"]) });

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/billing/checkout">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await startCheckout(ws, await readBody(request, schema), appOrigin(request)));
  });
}
