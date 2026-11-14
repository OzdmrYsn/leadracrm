import { createAutomation, listAutomations } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { automationSchema } from "@/server/schemas";

// ?pipeline=<kimlik> verilmezse ana pipeline'ın tetikleyicileri döner.
export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/automations">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listAutomations(ws, new URL(request.url).searchParams.get("pipeline") ?? undefined));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/automations">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createAutomation(ws, await readBody(request, automationSchema)), { status: 201 });
  });
}
