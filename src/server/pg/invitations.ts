// Kullanıcı daveti. Yönetici bir e-posta adresini davet eder; davetli 12 saat geçerli bağlantıdan adını ve şifresini
// belirleyerek çalışma alanına katılır. Bekleyen davetler de koltuk sayılır: koltuk dolduysa davet gönderilemez.
// Bağlantıdaki belirtecin yalnız özeti saklanır.
import type { Id, Invitation, InvitationPreview } from "@/lib/types";
import { db, type Tx } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { verifyPassword } from "../password";
import { insertUser, newToken, tokenDigest } from "./accounts";
import { inWorkspace, requireAdmin, type Ctx } from "./ctx";

const INVITE_HOURS = 12;
const expiry = () => new Date(Date.now() + INVITE_HOURS * 3_600_000).toISOString();

async function pending(ctx: Ctx): Promise<Invitation[]> {
  const rows = await ctx.sql<Invitation[]>`
    select i.id, i.email, i.full_name as name, i.is_admin, i.group_id, i.expires_at, i.last_sent_at,
      i.expires_at <= now() as expired, p.full_name as invited_by
    from invitations i left join profiles p on p.id = i.invited_by
    where i.workspace_id = ${ctx.ws.id} and i.status = 'pending'
    order by i.created_at`;
  return rows.map((row) => ({ ...row }));
}

/** Bekleyen davetler (süresi dolanlar da listelenir; yeniden gönderilebilir). Yalnız yönetici. */
export function listInvitations(ws: string): Promise<Invitation[]> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    return pending(ctx);
  });
}

/** Etkin üyeler ve süresi dolmamış davetler koltuk sayısına ulaştıysa yeni davet gönderilemez. */
async function requireSeatForInvite(ctx: Ctx, exceptInvitation: Id | null = null): Promise<void> {
  const [{ used }] = await ctx.sql<Array<{ used: number }>>`
    select (
      (select count(*) from workspace_members where workspace_id = ${ctx.ws.id} and is_active) +
      (select count(*) from invitations where workspace_id = ${ctx.ws.id} and status = 'pending' and expires_at > now()
         and id is distinct from ${exceptInvitation})
    )::int as used`;
  if (used >= ctx.subscription.seats) throw new DataError(409, "seat_limit", `all ${ctx.subscription.seats} seats are in use`);
}

/** Davet edenin e-postası doğrulanmış olmalı: doğrulanmamış bir hesap başkalarına ileti gönderemesin. */
async function requireVerifiedInviter(ctx: Ctx): Promise<void> {
  const [row] = await ctx.system(() => ctx.sql<Array<{ ok: boolean }>>`
    select (c.user_id is null or c.email_verified_at is not null) as ok
    from profiles p left join user_credentials c on c.user_id = p.id where p.id = ${ctx.user.id}`);
  if (!row?.ok) throw new DataError(403, "verify_email_first", "verify your email before inviting others");
}

export type InviteMail = { email: string; token: string; workspaceName: string; inviterName: string };

/**
 * Daveti oluşturur ve gönderilecek iletinin bilgisini döndürür (iletiyi uç gönderir). Aynı adrese bekleyen bir davet
 * varsa yenisi açılmaz: bağlantısı ve süresi yenilenir. Adres zaten üyeyse 409.
 */
export function createInvitation(ws: string, input: { email: string; name: string; isAdmin: boolean; groupId: Id | null }): Promise<{ invitation: Invitation; mail: InviteMail }> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    await requireVerifiedInviter(ctx);
    const email = input.email.trim().toLowerCase();
    if (input.groupId) {
      if (!isUuid(input.groupId)) throw notFound("group");
      const [group] = await ctx.sql`select 1 from groups where id = ${input.groupId} and workspace_id = ${ctx.ws.id}`;
      if (!group) throw notFound("group");
    }
    const [member] = await ctx.sql`
      select 1 from workspace_members m join profiles p on p.id = m.user_id where m.workspace_id = ${ctx.ws.id} and lower(p.email) = ${email}`;
    if (member) throw new DataError(409, "already_member", "this person is already in the workspace");
    const [existing] = await ctx.sql<Array<{ id: Id }>>`
      select id from invitations where workspace_id = ${ctx.ws.id} and lower(email) = ${email} and status = 'pending'`;
    await requireSeatForInvite(ctx, existing?.id ?? null);

    const token = newToken();
    const [row] = existing
      ? await ctx.sql<Array<{ id: Id }>>`
          update invitations set full_name = ${input.name.trim()}, is_admin = ${input.isAdmin}, group_id = ${input.groupId},
            token_hash = ${tokenDigest(token)}, expires_at = ${expiry()}, last_sent_at = now(), invited_by = ${ctx.user.id}
          where id = ${existing.id} returning id`
      : await ctx.sql<Array<{ id: Id }>>`
          insert into invitations (workspace_id, email, full_name, is_admin, group_id, token_hash, expires_at, invited_by)
          values (${ctx.ws.id}, ${email}, ${input.name.trim()}, ${input.isAdmin}, ${input.groupId}, ${tokenDigest(token)}, ${expiry()}, ${ctx.user.id})
          returning id`;
    const invitation = (await pending(ctx)).find((item) => item.id === row.id)!;
    return { invitation, mail: { email, token, workspaceName: ctx.ws.name, inviterName: ctx.user.name } };
  });
}

/** Bağlantıyı yeniler ve iletinin bilgisini döndürür. Süresi dolmuş davet yeniden gönderilirken koltuk yeniden sayılır. */
export function renewInvitation(ws: string, invitationId: Id): Promise<InviteMail> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(invitationId)) throw notFound("invitation");
    const [row] = await ctx.sql<Array<{ id: Id; email: string }>>`
      select id, email from invitations where id = ${invitationId} and workspace_id = ${ctx.ws.id} and status = 'pending' for update`;
    if (!row) throw notFound("invitation");
    await requireSeatForInvite(ctx, row.id);
    const token = newToken();
    await ctx.sql`
      update invitations set token_hash = ${tokenDigest(token)}, expires_at = ${expiry()}, last_sent_at = now(), invited_by = ${ctx.user.id} where id = ${row.id}`;
    return { email: row.email, token, workspaceName: ctx.ws.name, inviterName: ctx.user.name };
  });
}

/** Daveti geri alır: bağlantı artık çalışmaz, koltuk boşalır. */
export function revokeInvitation(ws: string, invitationId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(invitationId)) throw notFound("invitation");
    const updated = await ctx.sql`
      update invitations set status = 'revoked' where id = ${invitationId} and workspace_id = ${ctx.ws.id} and status = 'pending' returning id`;
    if (updated.length === 0) throw notFound("invitation");
  });
}

/* ---------- davetlinin tarafı (oturumsuz) ---------- */

type OpenInvitation = { id: Id; workspaceId: Id; workspaceName: string; slug: string; email: string; name: string; isAdmin: boolean; groupId: Id | null; inviterName: string | null; seats: number };

/** Bağlantıdaki belirtece karşılık gelen, hâlâ geçerli davet. Yoksa 410. */
async function openInvitation(sql: Tx, token: string, lock = false): Promise<OpenInvitation> {
  const [row] = await sql<OpenInvitation[]>`
    select i.id, i.workspace_id, w.name as workspace_name, w.slug, i.email, i.full_name as name, i.is_admin, i.group_id,
      p.full_name as inviter_name, coalesce(s.seats, 500) as seats
    from invitations i
    join workspaces w on w.id = i.workspace_id
    left join profiles p on p.id = i.invited_by
    left join subscriptions s on s.workspace_id = i.workspace_id
    where i.token_hash = ${tokenDigest(token)} and i.status = 'pending' and i.expires_at > now()
    ${lock ? sql`for update of i` : sql``}`;
  if (!row) throw new DataError(410, "link_invalid", "invitation is invalid, expired or already used");
  return row;
}

/** Davet sayfasında gösterilecek bilgi. hasAccount: bu e-postanın zaten bir hesabı var (şifresini yazarak katılır). */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  // Oturum yoktur; hesap tablolarına sunucu bağlantısıyla girilir (accounts.ts ile aynı).
  const result = await db().begin(async (sql) => {
    const invitation = await openInvitation(sql, token);
    const [account] = await sql`select 1 from auth.users where lower(email) = ${invitation.email.toLowerCase()}`;
    return { workspaceName: invitation.workspaceName, email: invitation.email, name: invitation.name, inviterName: invitation.inviterName, hasAccount: Boolean(account) };
  });
  return result as InvitationPreview;
}

/**
 * Daveti kabul eder. Hesabı olmayan davetli adını ve şifresini belirler (adresi doğrulanmış sayılır: bağlantı oraya
 * gitti). Hesabı olan davetli kendi şifresini yazar. Koltuk o anda doluysa 409. Dönen kullanıcıya oturum açılır.
 */
export async function acceptInvitation(token: string, input: { name: string; password: string }): Promise<{ userId: string; slug: string }> {
  const result = await db().begin(async (sql) => {
    const invitation = await openInvitation(sql, token, true);
    const email = invitation.email.toLowerCase();
    const [{ used }] = await sql<Array<{ used: number }>>`
      select count(*)::int as used from workspace_members where workspace_id = ${invitation.workspaceId} and is_active`;
    if (used >= invitation.seats) throw new DataError(409, "seat_limit", "all seats are in use");

    const [existing] = await sql<Array<{ id: string; passwordHash: string | null }>>`
      select u.id, c.password_hash from auth.users u left join user_credentials c on c.user_id = u.id where lower(u.email) = ${email}`;
    let userId: string;
    if (existing) {
      if (!existing.passwordHash || !(await verifyPassword(input.password, existing.passwordHash))) throw new DataError(401, "invalid_login", "password is wrong");
      userId = existing.id;
    } else {
      userId = await insertUser(sql, { name: input.name || invitation.name || email, email, password: input.password, verified: true });
    }
    await sql`
      insert into workspace_members (workspace_id, user_id, is_admin, is_active, group_id)
      values (${invitation.workspaceId}, ${userId}, ${invitation.isAdmin}, true, ${invitation.groupId})
      on conflict (workspace_id, user_id) do update set is_active = true, is_admin = excluded.is_admin, group_id = excluded.group_id`;
    await sql`update invitations set status = 'accepted', accepted_at = now() where id = ${invitation.id}`;
    return { userId, slug: invitation.slug };
  });
  return result as { userId: string; slug: string };
}
