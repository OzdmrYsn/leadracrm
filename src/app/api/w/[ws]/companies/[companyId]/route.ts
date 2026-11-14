import { z } from "zod";
import { getCompany, updateCompany } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  responsibleUserId: z.string().min(1).nullable().optional(),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).optional(),
});

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/companies/[companyId]">) {
  return handle(async () => {
    const { ws, companyId } = await ctx.params;
    return Response.json(await getCompany(ws, companyId));
  });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/companies/[companyId]">) {
  return handle(async () => {
    const { ws, companyId } = await ctx.params;
    return Response.json(await updateCompany(ws, companyId, await readBody(request, schema)));
  });
}
