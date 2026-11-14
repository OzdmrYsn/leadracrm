import { z } from "zod";
import { deleteLead, getLead, updateLead } from "@/server/data";
import { handle, readBody } from "@/server/http";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  priceMinor: z.number().int().min(0).optional(),
  responsibleUserId: z.string().min(1).nullable().optional(),
  contactId: z.string().min(1).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).optional(),
  lossReasonId: z.string().min(1).nullable().optional(),
  stageId: z.string().min(1).optional(),
  expectedStageId: z.string().min(1).optional(),
});

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    return Response.json(await getLead(ws, leadId));
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    return Response.json(await updateLead(ws, leadId, await readBody(request, updateSchema)));
  });
}

// Çöp kutusuna taşır.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/leads/[leadId]">) {
  return handle(async () => {
    const { ws, leadId } = await ctx.params;
    await deleteLead(ws, leadId);
    return new Response(null, { status: 204 });
  });
}
