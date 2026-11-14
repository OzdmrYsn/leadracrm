import { z } from "zod";
import { createLead, listLeads } from "@/server/data";
import { handle, parseLeadFilter, readBody } from "@/server/http";

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  priceMinor: z.number().int().min(0).optional(),
  stageId: z.string().min(1).optional(),
  responsibleUserId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).optional(),
  contactName: z.string().trim().max(255).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/leads">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listLeads(ws, parseLeadFilter(request)));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/leads">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createLead(ws, await readBody(request, createSchema)), { status: 201 });
  });
}
