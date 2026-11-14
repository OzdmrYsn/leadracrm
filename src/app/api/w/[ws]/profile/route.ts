import { updateProfile } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { profilePatchSchema } from "@/server/schemas";

export async function PATCH(request: Request, ctx: RouteContext<"/api/w/[ws]/profile">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    return Response.json(await updateProfile(ws, await readBody(request, profilePatchSchema)));
  });
}
