import { z } from "zod";
import { addNote } from "@/server/data";
import { handle, readBody } from "@/server/http";

const noteSchema = z.object({ leadId: z.string().min(1), body: z.string().trim().min(1).max(10000) });

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/notes">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const input = await readBody(request, noteSchema);
    return Response.json(await addNote(ws, input.leadId, input.body), { status: 201 });
  });
}
