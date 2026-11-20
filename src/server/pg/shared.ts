// Birden çok modülün kullandığı okuyucular: pipeline, aşama, lead özeti, kişi, şirket, konuşma.
import type {
  Company,
  CompanySummary,
  Contact,
  ContactHandle,
  ContactSummary,
  Conversation,
  CustomValues,
  Id,
  LeadFilter,
  LeadSummary,
  Message,
  Pipeline,
  Stage,
  Tag,
} from "@/lib/types";
import type { StageColor } from "@/components/ui/tag";
import type { Fragment } from "../db";
import { isUuid, notFound } from "../errors";
import type { Ctx } from "./ctx";

/* ---------- pipeline ve aşamalar ---------- */

export async function loadPipelines(ctx: Ctx): Promise<Pipeline[]> {
  return ctx.sql<Pipeline[]>`
    select p.id, p.name, p.is_main, p.incoming_enabled,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'pipelineId', s.pipeline_id, 'name', s.name, 'kind', s.kind, 'color', s.color, 'sort', s.sort)
                         order by s.sort, s.created_at)
        from stages s where s.pipeline_id = p.id), '[]'::jsonb) as stages
    from pipelines p
    where p.workspace_id = ${ctx.ws.id} and p.archived_at is null
    order by p.is_main desc, p.sort, p.created_at`;
}

/** Kimlik verilmezse ya da "main" ise ana pipeline. */
export async function loadPipeline(ctx: Ctx, pipelineId?: Id): Promise<Pipeline> {
  const pipelines = await loadPipelines(ctx);
  const pipeline = !pipelineId || pipelineId === "main" ? pipelines.find((p) => p.isMain) : pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) throw notFound("pipeline");
  return pipeline;
}

export async function findStage(ctx: Ctx, stageId: Id): Promise<Stage> {
  if (!isUuid(stageId)) throw notFound("stage");
  const [stage] = await ctx.sql<Stage[]>`
    select id, pipeline_id, name, kind, color, sort from stages where id = ${stageId} and workspace_id = ${ctx.ws.id}`;
  if (!stage) throw notFound("stage");
  return stage;
}

export const openStages = (pipeline: Pipeline): Stage[] => pipeline.stages.filter((s) => s.kind === "open").sort((a, b) => a.sort - b.sort);

/* ---------- lead özeti ve süzgeç ---------- */

type TagRow = { id: Id; name: string; color: StageColor | null };

export const toTag = (row: TagRow): Tag => (row.color === null ? { id: row.id, name: row.name } : { id: row.id, name: row.name, color: row.color });

type SummaryRow = {
  id: Id;
  name: string;
  priceMinor: number;
  currency: string;
  stageId: Id;
  updatedAt: string;
  lastMessageAt: string | null;
  contactName: string | null;
  companyName: string | null;
  lastMessagePreview: string | null;
  unread: number;
  hasTask: boolean;
  responsibleId: Id | null;
  responsibleName: string | null;
  tags: TagRow[];
};

/** Süzgeci SQL koşuluna çevirir. Geçersiz kimlik hiçbir kayıtla eşleşmez. */
export function leadFilter(ctx: Ctx, filter: LeadFilter): Fragment {
  const { sql, ws, user } = ctx;
  const none = sql`and false`;
  const parts: Fragment[] = [];
  if (filter.pipelineId) parts.push(isUuid(filter.pipelineId) ? sql`and l.pipeline_id = ${filter.pipelineId}` : none);
  if (filter.stageId) parts.push(isUuid(filter.stageId) ? sql`and l.stage_id = ${filter.stageId}` : none);
  // "deleted" (çöp kutusu) aşamaya bakmaz; silinmiş olma koşulunu leadSummaries ekler.
  if (filter.status === "open") parts.push(sql`and st.kind in ('incoming', 'open')`);
  if (filter.status === "won" || filter.status === "lost") parts.push(sql`and st.kind = ${filter.status}`);
  if (filter.responsible === "me") parts.push(sql`and l.responsible_user_id = ${user.id}`);
  else if (filter.responsible === "none") parts.push(sql`and l.responsible_user_id is null`);
  else if (filter.responsible) parts.push(isUuid(filter.responsible) ? sql`and l.responsible_user_id = ${filter.responsible}` : none);
  if (filter.tagIds?.length) {
    const ids = filter.tagIds.filter(isUuid);
    parts.push(ids.length ? sql`and exists (select 1 from taggings tg where tg.lead_id = l.id and tg.tag_id in ${sql(ids)})` : none);
  }
  if (filter.noTask) parts.push(sql`and l.closest_task_at is null`);
  if (filter.unread) parts.push(sql`and coalesce(cv.unread_count, 0) > 0`);
  // Tarih süzgeci çalışma alanının saat dilimindeki takvim gününe göredir.
  if (filter.createdFrom) parts.push(sql`and (l.created_at at time zone ${ws.timezone})::date >= ${filter.createdFrom}::date`);
  if (filter.createdTo) parts.push(sql`and (l.created_at at time zone ${ws.timezone})::date <= ${filter.createdTo}::date`);
  if (filter.query?.trim()) {
    // position() joker karakter tanımaz: "%" ya da "_" aranırsa harfiyen aranır.
    parts.push(sql`and position(app.fold(${filter.query}) in app.fold(concat_ws(' ', l.name, ct.name, coalesce(co.name, cco.name)))) > 0`);
  }
  return parts.reduce<Fragment>((all, part) => sql`${all} ${part}`, sql``);
}

/** Lead özetleri, en son güncellenen önce. Silinen lead'ler hiçbir zaman dönmez. where "and ..." ile başlar. */
export async function leadSummaries(ctx: Ctx, where: Fragment, deleted = false): Promise<LeadSummary[]> {
  const { sql, ws } = ctx;
  const rows = await sql<SummaryRow[]>`
    select l.id, l.name, l.price_minor, l.currency, l.stage_id, l.updated_at, l.last_message_at,
      ct.name as contact_name,
      -- Lead'in kendi şirketi önceliklidir; yoksa kişinin şirketi gösterilir.
      coalesce(co.name, cco.name) as company_name,
      cv.last_message_preview,
      coalesce(cv.unread_count, 0) as unread,
      (l.closest_task_at is not null) as has_task,
      ru.id as responsible_id, ru.full_name as responsible_name,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.name)
        from taggings tg join tags t on t.id = tg.tag_id where tg.lead_id = l.id), '[]'::jsonb) as tags
    from leads l
    join stages st on st.id = l.stage_id
    left join lead_contacts lc on lc.lead_id = l.id and lc.is_main
    left join contacts ct on ct.id = lc.contact_id
    left join companies co on co.id = l.company_id
    left join companies cco on cco.id = ct.company_id
    left join lateral (
      select c.last_message_preview, c.unread_count from conversations c
      where c.lead_id = l.id order by c.last_message_at desc nulls last limit 1) cv on true
    left join profiles ru on ru.id = l.responsible_user_id
    where l.workspace_id = ${ws.id} and l.deleted_at is ${deleted ? sql`not null` : sql`null`} ${where}
    order by l.updated_at desc, l.id`;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    priceMinor: row.priceMinor,
    currency: row.currency,
    stageId: row.stageId,
    contactName: row.contactName,
    companyName: row.companyName,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageAt: row.lastMessageAt,
    unread: row.unread,
    hasTask: row.hasTask,
    tags: row.tags.map(toTag),
    responsible: row.responsibleId ? { id: row.responsibleId, name: row.responsibleName ?? "" } : null,
    updatedAt: row.updatedAt,
  }));
}

/* ---------- kişiler ve şirketler ---------- */

type ContactRow = {
  id: Id;
  name: string;
  companyId: Id | null;
  company: string | null;
  responsibleUserId: Id | null;
  custom: CustomValues;
  createdAt: string;
  updatedAt: string;
  handles: ContactHandle[];
};

export async function loadContact(ctx: Ctx, contactId: Id | null): Promise<Contact | null> {
  if (!contactId || !isUuid(contactId)) return null;
  const [row] = await ctx.sql<ContactRow[]>`
    select c.id, c.name, c.company_id, co.name as company, c.responsible_user_id, c.custom, c.created_at, c.updated_at,
      coalesce((
        select jsonb_agg(jsonb_build_object('kind', h.kind, 'value', h.value) order by h.created_at, h.id)
        from contact_handles h where h.contact_id = c.id), '[]'::jsonb) as handles
    from contacts c left join companies co on co.id = c.company_id
    where c.id = ${contactId} and c.workspace_id = ${ctx.ws.id} and c.deleted_at is null`;
  return row ? { ...row } : null;
}

export async function findContact(ctx: Ctx, contactId: Id): Promise<Contact> {
  const contact = await loadContact(ctx, contactId);
  if (!contact) throw notFound("contact");
  return contact;
}

export async function loadCompany(ctx: Ctx, companyId: Id | null): Promise<Company | null> {
  if (!companyId || !isUuid(companyId)) return null;
  const [row] = await ctx.sql<Company[]>`
    select id, name, responsible_user_id, custom, created_at, updated_at
    from companies where id = ${companyId} and workspace_id = ${ctx.ws.id} and deleted_at is null`;
  return row ? { ...row } : null;
}

export async function findCompany(ctx: Ctx, companyId: Id): Promise<Company> {
  const company = await loadCompany(ctx, companyId);
  if (!company) throw notFound("company");
  return company;
}

type ContactSummaryRow = Omit<ContactSummary, "responsible"> & { responsibleId: Id | null; responsibleName: string | null };

/** where "and ..." ile başlar. */
export async function contactSummaries(ctx: Ctx, where: Fragment): Promise<ContactSummary[]> {
  const { sql, ws } = ctx;
  const rows = await sql<ContactSummaryRow[]>`
    select c.id, c.name, c.company_id, co.name as company, c.updated_at,
      (select h.value from contact_handles h where h.contact_id = c.id and h.kind in ('phone', 'whatsapp') order by h.created_at, h.id limit 1) as phone,
      (select h.value from contact_handles h where h.contact_id = c.id and h.kind = 'email' order by h.created_at, h.id limit 1) as email,
      ru.id as responsible_id, ru.full_name as responsible_name,
      (select count(*) from lead_contacts lc join leads l on l.id = lc.lead_id
       where lc.contact_id = c.id and lc.is_main and l.deleted_at is null)::int as lead_count
    from contacts c
    left join companies co on co.id = c.company_id
    left join profiles ru on ru.id = c.responsible_user_id
    where c.workspace_id = ${ws.id} and c.deleted_at is null ${where}`;
  return rows
    .map(({ responsibleId, responsibleName, ...row }) => ({ ...row, responsible: responsibleId ? { id: responsibleId, name: responsibleName ?? "" } : null }))
    .sort((a, b) => a.name.localeCompare(b.name, ws.locale));
}

type CompanySummaryRow = Omit<CompanySummary, "responsible"> & { responsibleId: Id | null; responsibleName: string | null };

export async function companySummaries(ctx: Ctx, where: Fragment): Promise<CompanySummary[]> {
  const { sql, ws } = ctx;
  const rows = await sql<CompanySummaryRow[]>`
    select co.id, co.name, co.updated_at,
      ru.id as responsible_id, ru.full_name as responsible_name,
      (select count(*) from contacts c where c.company_id = co.id and c.deleted_at is null)::int as contact_count,
      (select count(*) from leads l where l.company_id = co.id and l.deleted_at is null)::int as lead_count
    from companies co left join profiles ru on ru.id = co.responsible_user_id
    where co.workspace_id = ${ws.id} and co.deleted_at is null ${where}`;
  return rows
    .map(({ responsibleId, responsibleName, ...row }) => ({ ...row, responsible: responsibleId ? { id: responsibleId, name: responsibleName ?? "" } : null }))
    .sort((a, b) => a.name.localeCompare(b.name, ws.locale));
}

/* ---------- konuşmalar ve mesajlar ---------- */

type ConversationRow = Omit<Conversation, "channel"> & { channelId: Id; channelKind: Conversation["channel"]["kind"]; channelName: string };

/** where "and ..." ile başlar. */
export async function conversations(ctx: Ctx, where: Fragment): Promise<Conversation[]> {
  const { sql, ws } = ctx;
  const rows = await sql<ConversationRow[]>`
    select c.id, c.contact_id, ct.name as contact_name, c.status, c.assigned_user_id, c.unread_count,
      c.last_message_at, c.last_message_preview, c.last_inbound_at,
      ch.id as channel_id, ch.kind as channel_kind, ch.name as channel_name,
      l.id as lead_id, coalesce(st.kind = 'incoming', false) as lead_is_incoming
    from conversations c
    join channels ch on ch.id = c.channel_id
    join contacts ct on ct.id = c.contact_id
    left join leads l on l.id = c.lead_id and l.deleted_at is null
    left join stages st on st.id = l.stage_id
    where c.workspace_id = ${ws.id} ${where}
    order by c.last_message_at desc nulls last, c.id`;
  return rows.map(({ channelId, channelKind, channelName, ...row }) => ({ ...row, channel: { id: channelId, kind: channelKind, name: channelName } }));
}

/** where "and ..." ile başlar; m (messages) ve c (conversations) takma adlarını kullanabilir. */
export async function messages(ctx: Ctx, where: Fragment): Promise<Message[]> {
  const { sql, ws } = ctx;
  const rows = await sql<Message[]>`
    select m.id, m.conversation_id, m.direction, m.sender_kind,
      case when m.sender_kind = 'contact' then ct.name else p.full_name end as sender_name,
      coalesce(m.body, '') as body, m.status, m.error_code, m.client_token, m.created_at
    from messages m
    join conversations c on c.id = m.conversation_id
    join contacts ct on ct.id = c.contact_id
    left join profiles p on p.id = m.sender_user_id
    where m.workspace_id = ${ws.id} ${where}
    order by m.created_at, m.id`;
  return rows.map((row) => ({ ...row }));
}
