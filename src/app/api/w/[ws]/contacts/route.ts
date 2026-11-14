import { z } from "zod";
import { createContact, listContacts } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  companyId: z.string().min(1).nullable().optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(320).optional(),
});

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/contacts">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listContacts(ws, new URL(request.url).searchParams.get("q") ?? ""));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/contacts">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createContact(ws, await readBody(request, schema)), { status: 201 });
  });
}
