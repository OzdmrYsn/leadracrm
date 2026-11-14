import { updateWorkspace } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { workspacePatchSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/workspace">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await updateWorkspace(ws, await readBody(request, workspacePatchSchema)));
  });
}
