import { z } from "zod";
import { createInvitation, listInvitations } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { inviteMail, mailerSandbox, sendMail } from "@/server/mail";
import { appOrigin } from "@/server/origin";

const schema = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
  name: z.string().trim().max(120).default(""),
  isAdmin: z.boolean().default(false),
  groupId: z.string().min(1).nullable().default(null),
});

export async function GET(_request: Request, ctx: RouteContext<"/api/w/[ws]/invitations">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    // sandbox: iletiler gerçek posta yerine yerel giden kutusuna düşüyor (yalnız geliştirme).
    return Response.json({ items: await listInvitations(ws), sandbox: mailerSandbox() });
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/w/[ws]/invitations">) {
  return handle(async () => {
    const { ws } = await ctx.params;
    const { invitation, mail } = await createInvitation(ws, await readBody(request, schema));
    await sendMail(inviteMail(mail.email, { inviter: mail.inviterName, workspace: mail.workspaceName, link: `${appOrigin(request)}/invite/${mail.token}` }));
    return Response.json(invitation, { status: 201 });
  });
}
