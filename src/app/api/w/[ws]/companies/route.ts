import { z } from "zod";
import { createCompany, listCompanies } from "@/server/data";
import { handle, readBody } from "@/server/http";

const schema = z.object({ name: z.string().trim().min(1).max(255) });

export async function GET(request: Request, ctx: RouteContext<"/api/w/[ws]/companies">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await listCompanies(ws, new URL(request.url).searchParams.get("q") ?? ""));
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/companies">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await createCompany(ws, await readBody(request, schema)), { status: 201 });
  });
}
