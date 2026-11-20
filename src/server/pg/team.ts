// Ekip: üyeler, gruplar, yetkiler; çalışma alanı ve profil ayarları; genel arama.
import type { DateFormat, Group, Id, Member, Rights, SearchResults, TimeFormat, Workspace } from "@/lib/types";
import { DataError, isUuid, notFound } from "../errors";
import { inWorkspace, requireAdmin, workspaceOf, type Ctx } from "./ctx";
import { normalizeRights } from "./rights";
import { companySummaries, contactSummaries, leadFilter, leadSummaries } from "./shared";

/* ---------- üyeler ---------- */

type MemberRow = Omit<Member, "rights"> & { rights: unknown };

async function members(ctx: Ctx): Promise<Member[]> {
  const rows = await ctx.sql<MemberRow[]>`
    select p.id, p.full_name as name, p.email, m.is_admin, m.is_active, m.group_id,
      case when m.role_id is not null then r.rights else m.rights end as rights
    from workspace_members m
    join profiles p on p.id = m.user_id
    left join roles r on r.id = m.role_id
    where m.workspace_id = ${ctx.ws.id}`;
  return rows
    .map((row) => ({ ...row, rights: ctx.user.isAdmin ? normalizeRights(row.rights) : null }))
    .sort((a, b) => a.name.localeCompare(b.name, ctx.ws.locale));
}

/** Ekip listesi. Yetki matrisi yalnız yöneticiye döner; pasif üyeler de listelenir. */
export function listMembers(ws: string): Promise<Member[]> {
  return inWorkspace(ws, members);
}

/**
 * Üyenin rolünü, grubunu, yetkilerini ya da etkinliğini değiştirir. Yalnız yönetici.
 * Yönetici kendi yöneticiliğini kaldıramaz ve kendini pasifleştiremez (yanlışlıkla kendini dışarıda bırakmasın);
 * çalışma alanında en az bir etkin yönetici kalması ayrıca veritabanında zorlanır.
 */
export function updateMember(ws: string, userId: Id, input: { isAdmin?: boolean; isActive?: boolean; groupId?: Id | null; rights?: Rights }): Promise<Member> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    requireAdmin(ctx);
    if (!isUuid(userId)) throw notFound("member");
    const [member] = await sql<Array<{ isAdmin: boolean; isActive: boolean; groupId: Id | null; rights: unknown }>>`
      select is_admin, is_active, group_id, rights from workspace_members where workspace_id = ${ctx.ws.id} and user_id = ${userId} for update`;
    if (!member) throw notFound("member");
    if (userId === ctx.user.id && (input.isAdmin === false || input.isActive === false)) throw new DataError(422, "self_change");
    // Pasif üyeyi etkinleştirmek bir koltuk kullanır.
    if (input.isActive === true && !member.isActive) await requireFreeSeat(ctx);
    if (input.groupId) {
      if (!isUuid(input.groupId)) throw notFound("group");
      const [group] = await sql`select 1 from groups where id = ${input.groupId} and workspace_id = ${ctx.ws.id}`;
      if (!group) throw notFound("group");
    }
    await sql`
      update workspace_members set
        is_admin = ${input.isAdmin ?? member.isAdmin},
        is_active = ${input.isActive ?? member.isActive},
        group_id = ${input.groupId !== undefined ? input.groupId : member.groupId},
        rights = ${sql.json(input.rights ? normalizeRights(input.rights) : (member.rights as Rights))},
        role_id = ${input.rights ? null : sql`role_id`}
      where workspace_id = ${ctx.ws.id} and user_id = ${userId}`;
    return (await members(ctx)).find((item) => item.id === userId)!;
  });
}

/** Etkin üye sayısı koltuk sayısına ulaştıysa yeni üye etkinleşemez. */
export async function requireFreeSeat(ctx: Ctx): Promise<void> {
  const [{ used }] = await ctx.sql<Array<{ used: number }>>`
    select count(*)::int as used from workspace_members where workspace_id = ${ctx.ws.id} and is_active`;
  if (used >= ctx.subscription.seats) throw new DataError(409, "seat_limit", `all ${ctx.subscription.seats} seats are in use`);
}

/* ---------- gruplar ---------- */

async function groups(ctx: Ctx): Promise<Group[]> {
  const rows = await ctx.sql<Group[]>`select id, name from groups where workspace_id = ${ctx.ws.id} order by sort, created_at, id`;
  return rows.map((row) => ({ ...row }));
}

export function listGroups(ws: string): Promise<Group[]> {
  return inWorkspace(ws, groups);
}

export function createGroup(ws: string, input: { name: string }): Promise<Group> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const [{ sort }] = await ctx.sql<Array<{ sort: number }>>`select coalesce(max(sort), 0) + 10 as sort from groups where workspace_id = ${ctx.ws.id}`;
    const [group] = await ctx.sql<Group[]>`
      insert into groups (workspace_id, name, sort) values (${ctx.ws.id}, ${input.name.trim()}, ${sort}) returning id, name`;
    return { ...group };
  });
}

export function updateGroup(ws: string, groupId: Id, input: { name: string }): Promise<Group> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(groupId)) throw notFound("group");
    const [group] = await ctx.sql<Group[]>`
      update groups set name = ${input.name.trim()} where id = ${groupId} and workspace_id = ${ctx.ws.id} returning id, name`;
    if (!group) throw notFound("group");
    return { ...group };
  });
}

/** Grubu siler. Üyeleri grupsuz kalır; kayıtlardaki grup kopyası da boşalır. */
export function deleteGroup(ws: string, groupId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(groupId)) throw notFound("group");
    // Önce üyeler gruptan çıkarılır ki kayıtlardaki grup kopyası tetikleyiciyle güncellensin.
    await ctx.sql`update workspace_members set group_id = null where workspace_id = ${ctx.ws.id} and group_id = ${groupId}`;
    const deleted = await ctx.sql`delete from groups where id = ${groupId} and workspace_id = ${ctx.ws.id} returning id`;
    if (deleted.length === 0) throw notFound("group");
  });
}

/* ---------- çalışma alanı ve profil ---------- */

export function updateWorkspace(
  ws: string,
  input: { name?: string; currency?: string; timezone?: string; timeFormat?: TimeFormat; dateFormat?: DateFormat },
): Promise<Workspace> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (input.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      } catch {
        throw new DataError(422, "validation", "unknown time zone");
      }
    }
    const [row] = await ctx.sql<Array<{ name: string; currency: string; timezone: string; timeFormat: TimeFormat; dateFormat: DateFormat }>>`
      update workspaces set
        name = ${input.name !== undefined ? input.name.trim() : ctx.ws.name},
        currency = ${input.currency ?? ctx.ws.currency},
        timezone = ${input.timezone ?? ctx.ws.timezone},
        time_format = ${input.timeFormat ?? ctx.ws.timeFormat},
        date_format = ${input.dateFormat ?? ctx.ws.dateFormat}
      where id = ${ctx.ws.id}
      returning name, currency, timezone, time_format, date_format`;
    // Tek para birimi: çalışma alanınınki. Lead'lerdeki kopya onunla birlikte değişir; tutarlar çevrilmez.
    // Silinmiş lead'ler de dahil: geri alınırsa eski para birimiyle dönmesin.
    if (row.currency !== ctx.ws.currency) await ctx.sql`update leads set currency = ${row.currency} where workspace_id = ${ctx.ws.id}`;
    return workspaceOf({ ...ctx.ws, ...row });
  });
}

/** Kullanıcı yalnız kendi profilini değiştirir. */
export function updateProfile(ws: string, input: { name: string }): Promise<{ id: Id; name: string; email: string }> {
  return inWorkspace(ws, async (ctx) => {
    const [row] = await ctx.sql<Array<{ id: Id; name: string; email: string }>>`
      update profiles set full_name = ${input.name.trim()} where id = ${ctx.user.id} returning id, full_name as name, email`;
    return { ...row };
  });
}

/* ---------- genel arama ---------- */

const PER_KIND = 6;

/** Lead, kişi ve şirketlerde arar. Sonuçlar kullanıcının görme kapsamıyla sınırlıdır (veritabanı uygular). */
export function search(ws: string, query: string): Promise<SearchResults> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const text = query.trim();
    if (text.length < 2) return { leads: [], contacts: [], companies: [] };
    const leads = await leadSummaries(ctx, leadFilter(ctx, { query: text, status: "all" }));
    const contacts = await contactSummaries(
      ctx,
      sql`and position(app.fold(${text}) in app.fold(concat_ws(' ', c.name, (select string_agg(h.value, ' ') from contact_handles h where h.contact_id = c.id)))) > 0`,
    );
    const companies = await companySummaries(ctx, sql`and position(app.fold(${text}) in app.fold(co.name)) > 0`);
    return {
      leads: leads.slice(0, PER_KIND).map((lead) => ({ id: lead.id, name: lead.name, detail: [lead.contactName, lead.companyName].filter(Boolean).join(" · ") || null })),
      contacts: contacts.slice(0, PER_KIND).map((contact) => ({ id: contact.id, name: contact.name, detail: [contact.company, contact.phone ?? contact.email].filter(Boolean).join(" · ") || null })),
      companies: companies.slice(0, PER_KIND).map((company) => ({ id: company.id, name: company.name, detail: null })),
    };
  });
}
