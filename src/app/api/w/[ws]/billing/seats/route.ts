import { z } from "zod";
import { changeSeats } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { appOrigin } from "@/server/origin";

const schema = z.object({ seats: z.number().int().min(1).max(500) });

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/billing/seats">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { seats } = await readBody(request, schema);
    await changeSeats(ws, seats, appOrigin(request));
    return new Response(null, { status: 204 });
  });
}
