import { z } from "zod";
import { createTask, listTasks } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({
  leadId: z.string().min(1).optional(),
  contactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  typeId: z.string().min(1),
  text: z.string().trim().max(2000).optional(),
  dueAt: z.iso.datetime(),
  responsibleUserId: z.string().min(1).nullable().optional(),
});

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/tasks">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    return Response.json(
      await listTasks(ws, {
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        responsible: params.get("responsible") ?? undefined,
        status: status === "done" || status === "all" ? status : "open",
        leadId: params.get("lead") ?? undefined,
        contactId: params.get("contact") ?? undefined,
        companyId: params.get("company") ?? undefined,
      }),
    );
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/tasks">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createTask(ws, await readBody(request, schema)), { status: 201 });
  });
}
