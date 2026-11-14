import { updateMember } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { memberPatchSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/members/[userId]">) {
  return handle(async () => {
    const { ws, userId } = await ctx.params;
    return Response.json(await updateMember(ws, userId, await readBody(request, memberPatchSchema)));
  });
}
