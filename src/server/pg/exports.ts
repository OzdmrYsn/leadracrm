// CSV dışa aktarma: lead, kişi ve şirket listeleri. Dışa aktarma yetkisi (yok / kendi / grubu / tümü) burada uygulanır;
// kullanıcının zaten göremediği kayıtları veritabanı (RLS) eler.
import { tr } from "@/i18n/tr";
import { delimiterFor, toCsv } from "@/lib/csv";
import { dayOf, timeOf } from "@/lib/dates";
import type { CustomField, CustomValues, EntityType, Id, LeadFilter } from "@/lib/types";
import { inWorkspace, type Ctx } from "./ctx";
import { exportScope } from "./rights";
import { leadFilter } from "./shared";

export type CsvFile = { filename: string; csv: string };

const text = tr.transfer.columns;

async function fieldsOf(ctx: Ctx, entityType: EntityType): Promise<CustomField[]> {
  const rows = await ctx.sql<CustomField[]>`
    select f.id, f.entity_type, f.name, f.type, f.sort,
      coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.value) order by o.sort) from custom_field_options o where o.field_id = f.id), '[]'::jsonb) as options
    from custom_fields f where f.workspace_id = ${ctx.ws.id} and f.entity_type = ${entityType}
    order by f.sort, f.created_at, f.id`;
  return rows.map((row) => ({ ...row }));
}

/** Özel alan değerini tabloda okunur metne çevirir: seçenek kimliği yerine adı, sayı yerel ondalık işaretiyle. */
function customText(ctx: Ctx, field: CustomField, values: CustomValues): string {
  const value = values[field.id];
  if (value === undefined || value === null || value === "") return "";
  const label = (id: unknown) => field.options.find((option) => option.id === id)?.label ?? "";
  if (field.type === "checkbox") return value === true ? tr.transfer.yes : tr.transfer.no;
  if (field.type === "select") return label(value);
  if (field.type === "multiselect") return Array.isArray(value) ? value.map(label).filter(Boolean).join(", ") : "";
  if (field.type === "numeric" && typeof value === "number") return number(ctx, value);
  return String(value);
}

const number = (ctx: Ctx, value: number) => value.toLocaleString(ctx.ws.locale, { useGrouping: false, maximumFractionDigits: 6 });
const stamp = (ctx: Ctx, instant: string | Date) => `${dayOf(instant, ctx.ws.timezone)} ${timeOf(instant, ctx.ws.timezone)}`;
const file = (ctx: Ctx, name: string, rows: string[][]): CsvFile => ({
  filename: `${name}-${dayOf(Date.now(), ctx.ws.timezone)}.csv`,
  csv: toCsv(rows, delimiterFor(ctx.ws.locale)),
});

type LeadRow = {
  name: string;
  priceMinor: number;
  currency: string;
  pipeline: string;
  stage: string;
  responsible: string | null;
  responsibleUserId: Id | null;
  contact: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  tags: string;
  custom: CustomValues;
  createdAt: Date;
  updatedAt: Date;
};

/** Süzgece uyan lead'ler. Sütunlar: temel alanlar, ana kişinin iletişim bilgileri, etiketler ve lead'in özel alanları. */
export function exportLeads(ws: string, filter: LeadFilter): Promise<CsvFile> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const allowed = await exportScope(ctx, "leads");
    const fields = await fieldsOf(ctx, "lead");
    // Birleştirmeler ve takma adlar leadSummaries ile aynıdır; leadFilter onlara göre yazılmıştır.
    const rows = await sql<LeadRow[]>`
      select l.name, l.price_minor, l.currency, p.name as pipeline, st.name as stage, ru.full_name as responsible, l.responsible_user_id,
        ct.name as contact, coalesce(co.name, cco.name) as company,
        (select h.value from contact_handles h where h.contact_id = ct.id and h.kind in ('phone', 'whatsapp') order by h.created_at, h.id limit 1) as phone,
        (select h.value from contact_handles h where h.contact_id = ct.id and h.kind = 'email' order by h.created_at, h.id limit 1) as email,
        coalesce((select string_agg(t.name, ', ' order by t.name) from taggings tg join tags t on t.id = tg.tag_id where tg.lead_id = l.id), '') as tags,
        l.custom, l.created_at, l.updated_at
      from leads l
      join stages st on st.id = l.stage_id
      join pipelines p on p.id = l.pipeline_id
      left join lead_contacts lc on lc.lead_id = l.id and lc.is_main
      left join contacts ct on ct.id = lc.contact_id
      left join companies co on co.id = l.company_id
      left join companies cco on cco.id = ct.company_id
      left join profiles ru on ru.id = l.responsible_user_id
      where l.workspace_id = ${ctx.ws.id} and l.deleted_at is null ${leadFilter(ctx, filter)}
      order by l.updated_at desc, l.id`;
    const header = [text.lead, text.price, text.currency, text.pipeline, text.stage, text.responsible, text.contact, text.company, text.phone, text.email, text.tags, ...fields.map((field) => field.name), text.created, text.updated];
    const body = rows
      .filter((row) => allowed(row.responsibleUserId))
      .map((row) => [
        row.name,
        row.priceMinor > 0 ? number(ctx, row.priceMinor / 100) : "",
        row.currency,
        row.pipeline,
        row.stage,
        row.responsible ?? "",
        row.contact ?? "",
        row.company ?? "",
        row.phone ?? "",
        row.email ?? "",
        row.tags,
        ...fields.map((field) => customText(ctx, field, row.custom ?? {})),
        stamp(ctx, row.createdAt),
        stamp(ctx, row.updatedAt),
      ]);
    return file(ctx, tr.transfer.files.leads, [header, ...body]);
  });
}

type ContactRow = { name: string; company: string | null; phones: string; emails: string; responsible: string | null; responsibleUserId: Id | null; custom: CustomValues; createdAt: Date };

export function exportContacts(ws: string, query = ""): Promise<CsvFile> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const allowed = await exportScope(ctx, "contacts");
    const fields = await fieldsOf(ctx, "contact");
    const where = query.trim()
      ? sql`and position(app.fold(${query}) in app.fold(concat_ws(' ', c.name, co.name,
            (select string_agg(h.value, ' ') from contact_handles h where h.contact_id = c.id)))) > 0`
      : sql``;
    const rows = await sql<ContactRow[]>`
      select c.name, co.name as company, ru.full_name as responsible, c.responsible_user_id, c.custom, c.created_at,
        coalesce((select string_agg(h.value, ', ' order by h.created_at, h.id) from contact_handles h where h.contact_id = c.id and h.kind in ('phone', 'whatsapp')), '') as phones,
        coalesce((select string_agg(h.value, ', ' order by h.created_at, h.id) from contact_handles h where h.contact_id = c.id and h.kind = 'email'), '') as emails
      from contacts c
      left join companies co on co.id = c.company_id
      left join profiles ru on ru.id = c.responsible_user_id
      where c.workspace_id = ${ctx.ws.id} and c.deleted_at is null ${where}
      order by c.name, c.id`;
    const header = [text.contact, text.company, text.phone, text.email, text.responsible, ...fields.map((field) => field.name), text.created];
    const body = rows
      .filter((row) => allowed(row.responsibleUserId))
      .map((row) => [row.name, row.company ?? "", row.phones, row.emails, row.responsible ?? "", ...fields.map((field) => customText(ctx, field, row.custom ?? {})), stamp(ctx, row.createdAt)]);
    return file(ctx, tr.transfer.files.contacts, [header, ...body]);
  });
}

type CompanyRow = { name: string; responsible: string | null; responsibleUserId: Id | null; contacts: number; leads: number; custom: CustomValues; createdAt: Date };

export function exportCompanies(ws: string, query = ""): Promise<CsvFile> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const allowed = await exportScope(ctx, "companies");
    const fields = await fieldsOf(ctx, "company");
    const where = query.trim() ? sql`and position(app.fold(${query}) in app.fold(co.name)) > 0` : sql``;
    const rows = await sql<CompanyRow[]>`
      select co.name, ru.full_name as responsible, co.responsible_user_id, co.custom, co.created_at,
        (select count(*) from contacts c where c.company_id = co.id and c.deleted_at is null)::int as contacts,
        (select count(*) from leads l where l.company_id = co.id and l.deleted_at is null)::int as leads
      from companies co left join profiles ru on ru.id = co.responsible_user_id
      where co.workspace_id = ${ctx.ws.id} and co.deleted_at is null ${where}
      order by co.name, co.id`;
    const header = [text.company, text.responsible, text.contactCount, text.leadCount, ...fields.map((field) => field.name), text.created];
    const body = rows
      .filter((row) => allowed(row.responsibleUserId))
      .map((row) => [row.name, row.responsible ?? "", String(row.contacts), String(row.leads), ...fields.map((field) => customText(ctx, field, row.custom ?? {})), stamp(ctx, row.createdAt)]);
    return file(ctx, tr.transfer.files.companies, [header, ...body]);
  });
}
