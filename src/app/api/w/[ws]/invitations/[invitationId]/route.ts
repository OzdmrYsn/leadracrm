import { revokeInvitation } from "@/server/data";
import { handle } from "@/server/http";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/w/[ws]/invitations/[invitationId]">) {
  return handle(async () => {
    const { ws, invitationId } = await ctx.params;
    await revokeInvitation(ws, invitationId);
    return new Response(null, { status: 204 });
  });
}
