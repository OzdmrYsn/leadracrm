import { z } from "zod";
import { createField, listFields } from "@/server/data";
import { DataError } from "@/server/data";
import { handle, readBody } from "@/server/http";

const entity = z.enum(["lead", "contact", "company"]);
const schema = z.object({
  entityType: entity,
  name: z.string().trim().min(1).max(120),
  type: z.enum(["text", "numeric", "checkbox", "select", "multiselect", "date", "url"]),
  options: z.array(z.string().trim().max(255)).max(100).optional(),
});

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/fields">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const parsed = entity.safeParse(new URL(request.url).searchParams.get("entity"));
    if (!parsed.success) throw new DataError(422, "validation", "entity must be lead, contact or company");
    return Response.json(await listFields(ws, parsed.data));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/fields">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createField(ws, await readBody(request, schema)), { status: 201 });
  });
}
