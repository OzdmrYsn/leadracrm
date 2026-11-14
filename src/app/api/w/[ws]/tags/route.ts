import { z } from "zod";
import { createTag, listTags } from "@/server/data";
import { colorSchema, handle, readBody } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1).max(60), color: colorSchema.optional() });

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/tags">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listTags(ws));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/tags">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createTag(ws, await readBody(request, schema)), { status: 201 });
  });
}
