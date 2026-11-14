// Kişiler ve şirketler.
import { fold } from "@/lib/text";
import type { Company, CompanyDetail, CompanySummary, Contact, ContactDetail, ContactHandle, ContactSummary, CustomValues, Id } from "@/lib/types";
import { DataError } from "../errors";
import { applyCustom } from "./custom";
import { checkUser, handoff, inWorkspace, listUsers, type Ctx } from "./ctx";
import { requireAdd, requireCan } from "./rights";
import { companySummaries, contactSummaries, findCompany, findContact, leadSummaries, loadCompany } from "./shared";

const HANDLE_LIMIT = 10;

/** Telefon ve e-posta biçimini denetler, değeri sadeleştirir. Kanal kimlikleri (telegram vb.) olduğu gibi kalır. */
function cleanHandles(handles: ContactHandle[]): ContactHandle[] {
  if (handles.length > HANDLE_LIMIT) throw new DataError(422, "validation", "too many handles");
  const cleaned = handles.map((handle) => {
    const value = handle.value.trim();
    if (handle.kind === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new DataError(422, "invalid_email");
      return { kind: handle.kind, value: value.toLowerCase() };
    }
    if (handle.kind === "phone") {
      if (!/^\+?[\d\s()-]{5,20}$/.test(value)) throw new DataError(422, "invalid_phone");
      return { kind: handle.kind, value };
    }
    if (value === "") throw new DataError(422, "validation", "empty handle");
    return { kind: handle.kind, value };
  });
  const seen = new Set<string>();
  return cleaned.filter((handle) => {
    const key = `${handle.kind}:${fold(handle.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function writeHandles(ctx: Ctx, contactId: Id, handles: ContactHandle[]): Promise<void> {
  await ctx.sql`delete from contact_handles where contact_id = ${contactId}`;
  for (const handle of handles) {
    await ctx.sql`insert into contact_handles (workspace_id, contact_id, kind, value) values (${ctx.ws.id}, ${contactId}, ${handle.kind}, ${handle.value})`;
  }
}

/* ---------- kişiler ---------- */

/** Ad, şirket ve iletişim bilgisinde arar. Kişi seçici de bunu kullanır. */
export function listContacts(ws: string, query = ""): Promise<ContactSummary[]> {
  return inWorkspace(ws, (ctx) => {
    const { sql } = ctx;
    const where = query.trim()
      ? sql`and position(app.fold(${query}) in app.fold(concat_ws(' ', c.name, co.name,
            (select string_agg(h.value, ' ') from contact_handles h where h.contact_id = c.id)))) > 0`
      : sql``;
    return contactSummaries(ctx, where);
  });
}

export function getContact(ws: string, contactId: Id): Promise<ContactDetail> {
  return inWorkspace(ws, async (ctx) => {
    const contact = await findContact(ctx, contactId);
    const users = await listUsers(ctx);
    return {
      contact,
      company: await loadCompany(ctx, contact.companyId),
      responsible: users.find((user) => user.id === contact.responsibleUserId) ?? null,
      leads: await leadSummaries(
        ctx,
        ctx.sql`and exists (select 1 from lead_contacts mc where mc.lead_id = l.id and mc.contact_id = ${contact.id} and mc.is_main)`,
      ),
    };
  });
}

export function createContact(ws: string, input: { name: string; companyId?: Id | null; phone?: string; email?: string }): Promise<Contact> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    requireAdd(ctx, "contacts");
    if (input.companyId) await findCompany(ctx, input.companyId);
    const handles: ContactHandle[] = [];
    if (input.phone?.trim()) handles.push({ kind: "phone", value: input.phone });
    if (input.email?.trim()) handles.push({ kind: "email", value: input.email });
    const cleaned = cleanHandles(handles);
    const [created] = await sql<Array<{ id: Id }>>`
      insert into contacts (workspace_id, name, company_id, responsible_user_id, created_by, updated_by)
      values (${ctx.ws.id}, ${input.name.trim()}, ${input.companyId ?? null}, ${user.id}, ${user.id}, ${user.id}) returning id`;
    await writeHandles(ctx, created.id, cleaned);
    return findContact(ctx, created.id);
  });
}

export function updateContact(
  ws: string,
  contactId: Id,
  input: { name?: string; companyId?: Id | null; responsibleUserId?: Id | null; handles?: ContactHandle[]; custom?: CustomValues },
): Promise<Contact> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    const contact = await findContact(ctx, contactId);
    await requireCan(ctx, "contacts", "edit", contact.responsibleUserId);
    // Önce doğrula, sonra yaz.
    if (input.companyId) await findCompany(ctx, input.companyId);
    const responsible = input.responsibleUserId !== undefined ? await checkUser(ctx, input.responsibleUserId) : contact.responsibleUserId;
    const handles = input.handles ? cleanHandles(input.handles) : null;
    const custom = input.custom ? await applyCustom(ctx, "contact", contact.custom, input.custom) : contact.custom;

    await handoff(
      ctx,
      responsible,
      () => sql`
        update contacts set
          name = ${input.name !== undefined ? input.name.trim() : contact.name},
          company_id = ${input.companyId !== undefined ? input.companyId : contact.companyId},
          responsible_user_id = ${responsible},
          custom = ${sql.json(custom)},
          updated_by = ${user.id},
          updated_at = now()
        where id = ${contact.id}`,
    );
    if (handles) await writeHandles(ctx, contact.id, handles);
    return handoff(ctx, responsible, () => findContact(ctx, contact.id));
  });
}

/* ---------- şirketler ---------- */

export function listCompanies(ws: string, query = ""): Promise<CompanySummary[]> {
  return inWorkspace(ws, (ctx) => {
    const where = query.trim() ? ctx.sql`and position(app.fold(${query}) in app.fold(co.name)) > 0` : ctx.sql``;
    return companySummaries(ctx, where);
  });
}

export function getCompany(ws: string, companyId: Id): Promise<CompanyDetail> {
  return inWorkspace(ws, async (ctx) => {
    const company = await findCompany(ctx, companyId);
    const users = await listUsers(ctx);
    return {
      company,
      responsible: users.find((user) => user.id === company.responsibleUserId) ?? null,
      contacts: await contactSummaries(ctx, ctx.sql`and c.company_id = ${company.id}`),
      leads: await leadSummaries(ctx, ctx.sql`and l.company_id = ${company.id}`),
    };
  });
}

export function createCompany(ws: string, input: { name: string }): Promise<Company> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    requireAdd(ctx, "companies");
    const [created] = await sql<Array<{ id: Id }>>`
      insert into companies (workspace_id, name, responsible_user_id, created_by, updated_by)
      values (${ctx.ws.id}, ${input.name.trim()}, ${user.id}, ${user.id}, ${user.id}) returning id`;
    return findCompany(ctx, created.id);
  });
}

export function updateCompany(ws: string, companyId: Id, input: { name?: string; responsibleUserId?: Id | null; custom?: CustomValues }): Promise<Company> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    const company = await findCompany(ctx, companyId);
    await requireCan(ctx, "companies", "edit", company.responsibleUserId);
    const responsible = input.responsibleUserId !== undefined ? await checkUser(ctx, input.responsibleUserId) : company.responsibleUserId;
    const custom = input.custom ? await applyCustom(ctx, "company", company.custom, input.custom) : company.custom;
    await handoff(
      ctx,
      responsible,
      () => sql`
        update companies set
          name = ${input.name !== undefined ? input.name.trim() : company.name},
          responsible_user_id = ${responsible},
          custom = ${sql.json(custom)},
          updated_by = ${user.id},
          updated_at = now()
        where id = ${company.id}`,
    );
    return handoff(ctx, responsible, () => findCompany(ctx, company.id));
  });
}
