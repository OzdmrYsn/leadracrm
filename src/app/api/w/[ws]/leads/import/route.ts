import { z } from "zod";
import { importLeads } from "@/server/data";
import { handle, readBody } from "@/server/http";

const id = z.string().min(1).max(64);

// Bir istekte en çok 200 satır: tarayıcı dosyayı parçalar hâlinde gönderir ve ilerlemeyi gösterir.
const schema = z.object({
  stageId: id,
  responsibleUserId: id.nullable(),
  tagId: id.nullable().optional(),
  source: z.string().max(200),
  columns: z.array(z.object({ header: z.string().max(200), target: z.string().min(1).max(80) })).min(1).max(60),
  rows: z.array(z.array(z.string().max(5000)).max(60)).min(1).max(200),
});

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/leads/import">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await importLeads(ws, await readBody(request, schema)));
  });
}
