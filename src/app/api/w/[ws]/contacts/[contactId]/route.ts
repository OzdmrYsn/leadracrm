import { z } from "zod";
import { getContact, updateContact } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  companyId: z.string().min(1).nullable().optional(),
  responsibleUserId: z.string().min(1).nullable().optional(),
  handles: z
    .array(z.object({ kind: z.enum(["phone", "email", "telegram", "whatsapp"]), value: z.string().trim().min(1).max(320) }))
    .max(10)
    .optional(),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).optional(),
});

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/contacts/[contactId]">) {
  return handle(async () => {
    const { ws, contactId } = await ctx.params;
    return Response.json(await getContact(ws, contactId));
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/contacts/[contactId]">) {
  return handle(async () => {
    const { ws, contactId } = await ctx.params;
    return Response.json(await updateContact(ws, contactId, await readBody(request, schema)));
  });
}
