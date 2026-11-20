import { renewInvitation } from "@/server/data";
import { handle } from "@/server/http";
import { inviteMail, sendMail } from "@/server/mail";
import { appOrigin } from "@/server/origin";

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/invitations/[invitationId]/resend">) {
  return handle(async () => {
    const { ws, invitationId } = await ctx.params;
    const mail = await renewInvitation(ws, invitationId);
    await sendMail(inviteMail(mail.email, { inviter: mail.inviterName, workspace: mail.workspaceName, link: `${appOrigin(request)}/invite/${mail.token}` }));
    return new Response(null, { status: 204 });
  });
}
