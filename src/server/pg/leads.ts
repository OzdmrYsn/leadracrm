// Oturum, pano, lead'ler ve etiketler.
import type { StageColor } from "@/components/ui/tag";
import type { Board, BulkAction, BulkResult, CreateLeadInput, FeedItem, Id, Lead, LeadDetail, LeadEvent, LeadFilter, LeadSummary, Session, Tag, TaskType, UpdateLeadInput } from "@/lib/types";
import type { Tx } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { fireAutomations } from "./automations";
import { applyCustom } from "./custom";
import { checkUser, handoff, inWorkspace, listUsers, logEvent, requireAdmin, type Ctx } from "./ctx";
import { FULL_RIGHTS, requireAdd, requireCan } from "./rights";
import { conversations, findCompany, findContact, findStage, leadFilter, leadSummaries, loadCompany, loadContact, loadPipeline, loadPipelines, messages, openStages, toTag } from "./shared";

/* ---------- oturum ---------- */

export function getSession(ws: string): Promise<Session> {
  return inWorkspace(ws, async (ctx) => {
    const taskTypes = await ctx.sql<TaskType[]>`
      select id, name, is_system from task_types where workspace_id = ${ctx.ws.id} order by sort, created_at`;
    return {
      user: ctx.user,
      rights: ctx.user.isAdmin ? FULL_RIGHTS : ctx.rights,
      workspace: { slug: ctx.ws.slug, name: ctx.ws.name, currency: ctx.ws.currency, locale: ctx.ws.locale, timezone: ctx.ws.timezone },
      users: await listUsers(ctx),
      pipelines: await loadPipelines(ctx),
      taskTypes: taskTypes.map((type) => ({ ...type })),
      lossReasons: (await ctx.sql<Array<{ id: Id; name: string }>>`
        select id, name from loss_reasons where workspace_id = ${ctx.ws.id} order by sort, created_at, id`).map((reason) => ({ ...reason })),
    };
  });
}

/* ---------- pano ve liste ---------- */

export function getBoard(ws: string, pipelineId?: Id, filter: LeadFilter = {}): Promise<Board> {
  return inWorkspace(ws, async (ctx) => {
    const pipeline = await loadPipeline(ctx, pipelineId);
    // Panoda aşama ve durum süzgeci anlamsızdır; sütunlar zaten aşamadır.
    const where = leadFilter(ctx, { ...filter, pipelineId: pipeline.id, stageId: undefined, status: undefined });
    const leads = await leadSummaries(ctx, where);
    const columns = pipeline.stages
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((stage) => {
        const inStage = leads.filter((lead) => lead.stageId === stage.id);
        return { stage, count: inStage.length, totalMinor: inStage.reduce((sum, lead) => sum + lead.priceMinor, 0), leads: inStage };
      });
    return { pipeline, currency: ctx.ws.currency, columns };
  });
}

export function listLeads(ws: string, filter: LeadFilter = {}): Promise<LeadSummary[]> {
  return inWorkspace(ws, (ctx) => leadSummaries(ctx, leadFilter(ctx, { ...filter, status: filter.status ?? "open" }), filter.status === "deleted"));
}

/** Çöp kutusundaki lead'i geri alır. Silme yetkisi olan geri alabilir. Silinirken ayrılan konuşma yeniden bağlanmaz. */
export function restoreLead(ws: string, leadId: Id): Promise<Lead> {
  return inWorkspace(ws, async (ctx) => {
    if (!isUuid(leadId)) throw notFound("lead");
    const [deleted] = await ctx.sql<Array<{ id: Id; responsibleUserId: Id | null }>>`
      select id, responsible_user_id from leads where id = ${leadId} and workspace_id = ${ctx.ws.id} and deleted_at is not null for update`;
    if (!deleted) throw notFound("lead");
    await requireCan(ctx, "leads", "delete", deleted.responsibleUserId);
    await ctx.sql`update leads set deleted_at = null, updated_by = ${ctx.user.id}, updated_at = now() where id = ${deleted.id}`;
    return findLead(ctx, deleted.id);
  });
}

/* ---------- lead ---------- */

type LeadRow = Omit<Lead, "tagIds"> & { tagIds: Id[] | null };

/** lock: satırı işlem sonuna kadar kilitler; iki kullanıcının aynı lead'i aynı anda değiştirmesi sıraya girer. */
async function findLead(ctx: Ctx, leadId: Id, lock = false): Promise<Lead> {
  const { sql, ws } = ctx;
  if (!isUuid(leadId)) throw notFound("lead");
  if (lock) await sql`select 1 from leads where id = ${leadId} and workspace_id = ${ws.id} for update`;
  const [row] = await sql<LeadRow[]>`
    select l.id, l.name, l.price_minor, l.currency, l.pipeline_id, l.stage_id, l.responsible_user_id, l.company_id, l.custom,
      l.incoming_category, l.loss_reason_id, l.closest_task_at, l.last_message_at, l.stage_entered_at, l.closed_at, l.deleted_at, l.created_at, l.updated_at,
      (select lc.contact_id from lead_contacts lc where lc.lead_id = l.id and lc.is_main) as contact_id,
      (select c.id from conversations c where c.lead_id = l.id order by c.last_message_at desc nulls last limit 1) as conversation_id,
      (select jsonb_agg(tg.tag_id) from taggings tg where tg.lead_id = l.id) as tag_ids
    from leads l
    where l.id = ${leadId} and l.workspace_id = ${ws.id} and l.deleted_at is null`;
  if (!row) throw notFound("lead");
  return { ...row, tagIds: row.tagIds ?? [] };
}

export function getLead(ws: string, leadId: Id): Promise<LeadDetail> {
  return inWorkspace(ws, async (ctx) => {
    const lead = await findLead(ctx, leadId);
    const pipeline = await loadPipeline(ctx, lead.pipelineId);
    const stage = pipeline.stages.find((item) => item.id === lead.stageId);
    if (!stage) throw notFound("stage");
    const tags = await ctx.sql<Array<{ id: Id; name: string; color: StageColor | null }>>`
      select t.id, t.name, t.color from taggings tg join tags t on t.id = tg.tag_id where tg.lead_id = ${lead.id} order by t.name`;
    const users = await listUsers(ctx);
    const [conversation] = lead.conversationId ? await conversations(ctx, ctx.sql`and c.id = ${lead.conversationId}`) : [];
    return {
      lead,
      stage,
      pipeline,
      contact: await loadContact(ctx, lead.contactId),
      company: await loadCompany(ctx, lead.companyId),
      tags: tags.map(toTag),
      responsible: users.find((user) => user.id === lead.responsibleUserId) ?? null,
      conversation: conversation ?? null,
    };
  });
}

/** Mesajlar, notlar ve olaylar tek akışta, eskiden yeniye. */
export function getLeadFeed(ws: string, leadId: Id): Promise<FeedItem[]> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const lead = await findLead(ctx, leadId);
    const chat = await messages(ctx, sql`and c.lead_id = ${lead.id}`);
    const notes = await sql<Array<{ id: Id; body: string; authorName: string; createdAt: string }>>`
      select n.id, coalesce(n.body, '') as body, coalesce(p.full_name, n.params ->> 'author', '') as author_name, n.created_at
      from notes n left join profiles p on p.id = n.created_by
      where n.lead_id = ${lead.id} and n.type = 'common'`;
    const events = await sql<Array<Omit<LeadEvent, "leadId">>>`
      select e.id, e.type, p.full_name as actor_name,
        case when e.actor_kind in ('automation', 'integration') then e.actor_kind when e.actor_user_id is null then 'system' else 'user' end as actor_kind,
        e.value_before ->> 'text' as "from", e.value_after ->> 'text' as "to", e.created_at
      from events e left join profiles p on p.id = e.actor_user_id
      where e.lead_id = ${lead.id}`;
    const items: FeedItem[] = [
      ...chat.map((message): FeedItem => ({ kind: "message", at: message.createdAt, message })),
      ...notes.map((note): FeedItem => ({ kind: "note", at: note.createdAt, note: { ...note, leadId: lead.id } })),
      ...events.map(
        (event): FeedItem => ({
          kind: "event",
          at: event.createdAt,
          event: { ...event, leadId: lead.id },
        }),
      ),
    ];
    return items.sort((a, b) => a.at.localeCompare(b.at));
  });
}

export function createLead(ws: string, input: CreateLeadInput): Promise<Lead> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    requireAdd(ctx, "leads");
    const stage = input.stageId ? await findStage(ctx, input.stageId) : openStages(await loadPipeline(ctx))[0];
    if (!stage) throw new DataError(422, "invalid_stage", "pipeline has no open stage");
    if (stage.kind === "incoming") throw new DataError(422, "invalid_stage", "cannot create into the incoming stage");
    const responsibleUserId = input.responsibleUserId === undefined ? user.id : await checkUser(ctx, input.responsibleUserId);
    const linked = input.contactId ? await findContact(ctx, input.contactId) : null;
    const tagIds = (input.tagIds ?? []).filter(isUuid);
    const validTags = tagIds.length
      ? await sql<Array<{ id: Id }>>`select id from tags where workspace_id = ${ctx.ws.id} and entity_type = 'lead' and id in ${sql(tagIds)}`
      : [];

    let contactId = linked?.id ?? null;
    const contactName = input.contactName?.trim();
    if (!linked && contactName) {
      const [contact] = await handoff(
        ctx,
        responsibleUserId,
        () => sql<Array<{ id: Id }>>`
          insert into contacts (workspace_id, name, responsible_user_id, created_by, updated_by)
          values (${ctx.ws.id}, ${contactName}, ${responsibleUserId}, ${user.id}, ${user.id}) returning id`,
      );
      contactId = contact.id;
    }

    const [created] = await handoff(
      ctx,
      responsibleUserId,
      () => sql<Array<{ id: Id }>>`
        insert into leads (workspace_id, name, price_minor, currency, pipeline_id, stage_id, responsible_user_id, company_id, created_by, updated_by)
        values (${ctx.ws.id}, ${input.name.trim()}, ${input.priceMinor ?? 0}, ${ctx.ws.currency}, ${stage.pipelineId}, ${stage.id},
                ${responsibleUserId}, ${linked?.companyId ?? null}, ${user.id}, ${user.id})
        returning id`,
    );
    if (contactId) {
      await sql`insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (${ctx.ws.id}, ${created.id}, ${contactId}, true)`;
    }
    for (const tag of validTags) {
      await sql`insert into taggings (workspace_id, tag_id, lead_id) values (${ctx.ws.id}, ${tag.id}, ${created.id})`;
    }
    await logEvent(ctx, { leadId: created.id, type: "lead_created" });
    return afterLeadEvent(ctx, created.id, { type: "lead_created", stageId: stage.id });
  });
}

/**
 * Lead'i günceller. Önce doğrular, sonra yazar: bir alan geçersizse hiçbir şey değişmez.
 * Aşama değişirken expectedStageId verilirse ön koşuldur: lead bu arada başka bir aşamaya taşındıysa 409 döner.
 */
export function updateLead(ws: string, leadId: Id, input: UpdateLeadInput): Promise<Lead> {
  return inWorkspace(ws, (ctx) => applyLeadUpdate(ctx, leadId, input));
}

async function applyLeadUpdate(ctx: Ctx, leadId: Id, input: UpdateLeadInput): Promise<Lead> {
  const { sql, user } = ctx;
  const lead = await findLead(ctx, leadId, true);
  await requireCan(ctx, "leads", "edit", lead.responsibleUserId);

  const custom = input.custom ? await applyCustom(ctx, "lead", lead.custom, input.custom) : lead.custom;
  if (input.contactId) await findContact(ctx, input.contactId);
  if (input.companyId) await findCompany(ctx, input.companyId);
  const responsibleChanged = input.responsibleUserId !== undefined && input.responsibleUserId !== lead.responsibleUserId;
  let responsibleUserId = responsibleChanged ? await checkUser(ctx, input.responsibleUserId ?? null) : lead.responsibleUserId;

  let stageId = lead.stageId;
  let stageEvent: { type: "lead_accepted" | "stage_changed"; from: string | null; to: string } | null = null;
  if (input.stageId !== undefined && input.stageId !== lead.stageId) {
    if (input.expectedStageId !== undefined && input.expectedStageId !== lead.stageId) throw new DataError(409, "stage_conflict");
    const from = await findStage(ctx, lead.stageId);
    const to = await findStage(ctx, input.stageId);
    if (to.pipelineId !== lead.pipelineId) throw new DataError(422, "invalid_stage", "stage belongs to another pipeline");
    if (to.kind === "incoming") throw new DataError(422, "invalid_stage", "cannot move back to incoming");
    stageId = to.id;
    if (from.kind === "incoming") {
      // Talep hangi yoldan kabul edilirse edilsin (düğme, kart menüsü, sürükleme) sonuç aynıdır:
      // lead ve konuşma, sahibi yoksa kabul edene atanır.
      responsibleUserId ??= user.id;
      await sql`update conversations set assigned_user_id = ${user.id} where lead_id = ${lead.id} and assigned_user_id is null`;
      stageEvent = { type: "lead_accepted", from: null, to: to.name };
    } else {
      stageEvent = { type: "stage_changed", from: from.name, to: to.name };
    }
  }

  // Kayıp nedeni yalnız kaybedilen lead'de durur: başka bir aşamaya geçince silinir.
  let lossReasonId = lead.lossReasonId;
  if (input.lossReasonId !== undefined || lossReasonId !== null) {
    const lost = (await findStage(ctx, stageId)).kind === "lost";
    if (input.lossReasonId) {
      if (!lost) throw new DataError(422, "validation", "a loss reason needs a lost lead");
      if (!isUuid(input.lossReasonId)) throw notFound("loss reason");
      const [reason] = await sql`select 1 from loss_reasons where id = ${input.lossReasonId} and workspace_id = ${ctx.ws.id}`;
      if (!reason) throw notFound("loss reason");
    }
    if (input.lossReasonId !== undefined) lossReasonId = input.lossReasonId;
    if (!lost) lossReasonId = null;
  }

  // closed_at, stage_entered_at ve incoming_category aşamaya göre tetikleyicide ayarlanır.
  await handoff(
    ctx,
    responsibleUserId,
    () => sql`
      update leads set
        name = ${input.name !== undefined ? input.name.trim() : lead.name},
        price_minor = ${input.priceMinor ?? lead.priceMinor},
        stage_id = ${stageId},
        responsible_user_id = ${responsibleUserId},
        company_id = ${input.companyId !== undefined ? input.companyId : lead.companyId},
        loss_reason_id = ${lossReasonId},
        custom = ${sql.json(custom)},
        updated_by = ${user.id},
        updated_at = now()
      where id = ${lead.id}`,
  );

  if (input.contactId !== undefined && input.contactId !== lead.contactId) {
    // Ana kişi değişir; ayırmak kişiyi silmez.
    await sql`delete from lead_contacts where lead_id = ${lead.id} and (is_main or contact_id = ${input.contactId})`;
    if (input.contactId) {
      await sql`insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (${ctx.ws.id}, ${lead.id}, ${input.contactId}, true)`;
    }
  }

  if (stageEvent) await logEvent(ctx, { leadId: lead.id, ...stageEvent });
  if (responsibleChanged) {
    const [target] = responsibleUserId ? await sql<Array<{ fullName: string }>>`select full_name from profiles where id = ${responsibleUserId}` : [];
    await logEvent(ctx, { leadId: lead.id, type: "responsible_changed", to: target?.fullName ?? null });
  }
  return afterLeadEvent(ctx, lead.id, stageEvent ? { type: "stage_entered", stageId } : null);
}

/**
 * Olayın tetikleyicilerini çalıştırır ve lead'in son hâlini döndürür. İkisi de sunucu rolüyle yapılır:
 * tetikleyici lead'i başkasına atayabilir ve kısıtlı kapsamlı kullanıcı onu artık göremeyebilir; işlemi yapan
 * kullanıcıya yine de kendi işleminin sonucu döner.
 */
function afterLeadEvent(ctx: Ctx, leadId: Id, event: { type: "lead_created" | "stage_entered"; stageId: Id } | null): Promise<Lead> {
  return ctx.system(async () => {
    if (event) await fireAutomations(ctx.sql, ctx.ws.id, { ...event, leadId });
    return findLead(ctx, leadId);
  });
}

/** Lead'i çöp kutusuna taşır. Konuşma ve mesaj geçmişi gelen kutusunda kalır. */
export function deleteLead(ws: string, leadId: Id): Promise<void> {
  return inWorkspace(ws, (ctx) => removeLead(ctx, leadId));
}

async function removeLead(ctx: Ctx, leadId: Id): Promise<void> {
  const lead = await findLead(ctx, leadId, true);
  await requireCan(ctx, "leads", "delete", lead.responsibleUserId);
  // Konuşma sunucu rolüyle ayrılır: üyenin gelen kutusu kapsamı onu göstermese de silinmiş bir lead'e bağlı kalmasın.
  await ctx.system(() => ctx.sql`update conversations set lead_id = null where lead_id = ${lead.id}`);
  await ctx.sql`update leads set deleted_at = now(), updated_by = ${ctx.user.id} where id = ${lead.id}`;
}

/** Lead'e etiket ekler ve lead'den etiket kaldırır; diğer etiketlere dokunmaz. Etiketler çağıran tarafından doğrulanmış olmalı. */
async function editLeadTags(ctx: Ctx, leadId: Id, add: Id[], remove: Id[]): Promise<void> {
  const { sql } = ctx;
  const lead = await findLead(ctx, leadId, true);
  await requireCan(ctx, "leads", "edit", lead.responsibleUserId);
  if (remove.length) await sql`delete from taggings where lead_id = ${lead.id} and tag_id in ${sql(remove)}`;
  for (const tagId of add) {
    await sql`
      insert into taggings (workspace_id, tag_id, lead_id)
      select ${ctx.ws.id}, ${tagId}, ${lead.id}
      where not exists (select 1 from taggings where lead_id = ${lead.id} and tag_id = ${tagId})`;
  }
  await sql`update leads set updated_at = now(), updated_by = ${ctx.user.id} where id = ${lead.id}`;
}

/**
 * Seçili lead'lere toplu işlem. Her lead ayrı bir kayıt noktasında işlenir: yetki, aşama ve tetikleyici kuralları
 * tek tek uygulanır; biri uygulanamazsa yalnız o atlanır ve nedeni döner, diğerleri kaydedilir.
 * Hedefin kendisi geçersizse (olmayan kullanıcı, aşama ya da etiket) hiçbir lead'e dokunulmaz.
 */
export function bulkLeads(ws: string, ids: Id[], action: BulkAction): Promise<BulkResult> {
  return inWorkspace(ws, async (ctx) => {
    if (action.kind === "responsible") await checkUser(ctx, action.userId);
    if (action.kind === "stage" && (await findStage(ctx, action.stageId)).kind === "incoming") {
      throw new DataError(422, "invalid_stage", "cannot move into the incoming stage");
    }
    if (action.kind === "tags") {
      const wanted = [...new Set([...action.add, ...action.remove])];
      if (wanted.length === 0) throw new DataError(422, "validation", "no tags chosen");
      if (wanted.some((id) => !isUuid(id))) throw notFound("tag");
      const found = await ctx.sql`select id from tags where workspace_id = ${ctx.ws.id} and entity_type = 'lead' and id in ${ctx.sql(wanted)}`;
      if (found.length !== wanted.length) throw notFound("tag");
    }

    const result: BulkResult = { done: 0, skipped: [] };
    for (const leadId of [...new Set(ids)]) {
      try {
        await ctx.sql.savepoint(async (inner) => {
          const scoped: Ctx = { ...ctx, sql: inner as unknown as Tx };
          if (action.kind === "responsible") await applyLeadUpdate(scoped, leadId, { responsibleUserId: action.userId });
          else if (action.kind === "stage") {
            // Zaten o aşamadaki lead'e dokunulmaz (olay ve tetikleyici üretmesin).
            if ((await findLead(scoped, leadId)).stageId !== action.stageId) await applyLeadUpdate(scoped, leadId, { stageId: action.stageId });
          } else if (action.kind === "tags") await editLeadTags(scoped, leadId, [...new Set(action.add)], [...new Set(action.remove)]);
          else await removeLead(scoped, leadId);
        });
        result.done += 1;
      } catch (error) {
        // Beklenen retler (yetki yok, başka pipeline, kayıt yok) atlanır; beklenmeyen hata bütün işlemi geri alır.
        if (!(error instanceof DataError)) throw error;
        result.skipped.push({ id: leadId, reason: error.code });
      }
    }
    return result;
  });
}

export function setLeadTags(ws: string, leadId: Id, tagIds: Id[]): Promise<Tag[]> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const lead = await findLead(ctx, leadId, true);
    await requireCan(ctx, "leads", "edit", lead.responsibleUserId);
    const unique = [...new Set(tagIds)];
    if (unique.some((id) => !isUuid(id))) throw notFound("tag");
    const tags = unique.length
      ? await sql<Array<{ id: Id; name: string; color: StageColor | null }>>`
          select id, name, color from tags where workspace_id = ${ctx.ws.id} and entity_type = 'lead' and id in ${sql(unique)} order by name`
      : [];
    if (tags.length !== unique.length) throw notFound("tag");
    await sql`delete from taggings where lead_id = ${lead.id}`;
    for (const tag of tags) await sql`insert into taggings (workspace_id, tag_id, lead_id) values (${ctx.ws.id}, ${tag.id}, ${lead.id})`;
    await sql`update leads set updated_at = now(), updated_by = ${ctx.user.id} where id = ${lead.id}`;
    return tags.map(toTag);
  });
}

/** Gelen talebi ilk açık aşamaya alır ve çağıranı sorumlu yapar. Yalnız bir kullanıcı kabul edebilir. */
export function acceptLead(ws: string, leadId: Id): Promise<Lead> {
  return inWorkspace(ws, async (ctx) => {
    const lead = await findLead(ctx, leadId, true);
    const pipeline = await loadPipeline(ctx, lead.pipelineId);
    const stage = pipeline.stages.find((item) => item.id === lead.stageId);
    if (stage?.kind !== "incoming") throw new DataError(409, "already_handled");
    const first = openStages(pipeline)[0];
    if (!first) throw new DataError(422, "invalid_stage", "pipeline has no open stage");
    return applyLeadUpdate(ctx, lead.id, { stageId: first.id, expectedStageId: stage.id });
  });
}

/** Gelen talebi reddeder: lead silinir, konuşma kapanır (geçmişi kalır). */
export function declineLead(ws: string, leadId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const lead = await findLead(ctx, leadId, true);
    const stage = await findStage(ctx, lead.stageId);
    if (stage.kind !== "incoming") throw new DataError(409, "already_handled");
    // Talebi reddetmek, onu yanıtlamanın bir yoludur: silme değil düzenleme yetkisi ister.
    await requireCan(ctx, "leads", "edit", lead.responsibleUserId);
    // Konuşma sunucu rolüyle kapatılır: üyenin gelen kutusu kapsamı konuşmayı göstermese de lead'siz kalmasın.
    await ctx.system(
      () => sql`update conversations set lead_id = null, status = 'closed', closed_at = now(), unread_count = 0 where lead_id = ${lead.id}`,
    );
    await sql`update leads set deleted_at = now(), updated_by = ${ctx.user.id} where id = ${lead.id}`;
  });
}

/**
 * Gelen talebi mevcut bir lead'e bağlar: konuşma, notlar ve görevler hedef lead'e taşınır; talep için açılan lead silinir.
 * Hedef açık bir lead olmalıdır: başka bir gelen talebe ya da kapanmış bir lead'e bağlanamaz.
 */
export function linkIncomingLead(ws: string, leadId: Id, targetLeadId: Id): Promise<Lead> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    const lead = await findLead(ctx, leadId, true);
    const stage = await findStage(ctx, lead.stageId);
    if (stage.kind !== "incoming") throw new DataError(409, "already_handled");
    await requireCan(ctx, "leads", "edit", lead.responsibleUserId);

    if (targetLeadId === lead.id) throw new DataError(422, "invalid_target", "a request cannot be linked to itself");
    const target = await findLead(ctx, targetLeadId, true);
    const targetStage = await findStage(ctx, target.stageId);
    if (targetStage.kind !== "open") throw new DataError(422, "invalid_target", "target must be an open lead");
    await requireCan(ctx, "leads", "edit", target.responsibleUserId);

    const [sender] = await sql<Array<{ name: string }>>`
      select ct.name from conversations c join contacts ct on ct.id = c.contact_id where c.lead_id = ${lead.id} order by c.last_message_at desc nulls last limit 1`;
    // Taşıma sunucu rolüyle yapılır: konuşma hedefin sorumlusuna geçer ve bağlayanın görme kapsamından çıkabilir.
    // Yetki yukarıda iki lead için de denetlendi.
    await ctx.system(async () => {
      await sql`
        update conversations set lead_id = ${target.id}, assigned_user_id = coalesce(assigned_user_id, ${target.responsibleUserId})
        where lead_id = ${lead.id}`;
      await sql`update notes set lead_id = ${target.id} where lead_id = ${lead.id}`;
      await sql`update tasks set lead_id = ${target.id} where lead_id = ${lead.id}`;
    });
    // Hedef lead'in ana kişisi yoksa yazan kişi ana kişi olur.
    if (!target.contactId && lead.contactId) {
      await sql`insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (${ctx.ws.id}, ${target.id}, ${lead.contactId}, true)`;
    }
    await sql`update leads set deleted_at = now(), updated_by = ${user.id} where id = ${lead.id}`;
    await sql`update leads set updated_at = now(), updated_by = ${user.id} where id = ${target.id}`;
    await logEvent(ctx, { leadId: target.id, type: "request_linked", to: sender?.name ?? null });
    return afterLeadEvent(ctx, target.id, null);
  });
}

/* ---------- etiketler ---------- */

export function listTags(ws: string): Promise<Tag[]> {
  return inWorkspace(ws, async (ctx) => {
    const rows = await ctx.sql<Array<{ id: Id; name: string; color: StageColor | null; count: number }>>`
      select t.id, t.name, t.color,
        (select count(*) from taggings tg join leads l on l.id = tg.lead_id where tg.tag_id = t.id and l.deleted_at is null)::int as count
      from tags t where t.workspace_id = ${ctx.ws.id} and t.entity_type = 'lead'`;
    return rows.map((row) => ({ ...toTag(row), count: row.count })).sort((a, b) => a.name.localeCompare(b.name, ctx.ws.locale));
  });
}

async function findTag(ctx: Ctx, tagId: Id): Promise<{ id: Id; name: string; color: StageColor | null }> {
  if (!isUuid(tagId)) throw notFound("tag");
  const [tag] = await ctx.sql<Array<{ id: Id; name: string; color: StageColor | null }>>`
    select id, name, color from tags where id = ${tagId} and workspace_id = ${ctx.ws.id} and entity_type = 'lead'`;
  if (!tag) throw notFound("tag");
  return tag;
}

/** Etiketin rengini değiştirir. Ad değişmez: etiket adı süzgeçlerde ve otomasyonlarda tanınan şeydir. Yalnız yönetici. */
export function updateTag(ws: string, tagId: Id, input: { color: StageColor | null }): Promise<Tag> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const tag = await findTag(ctx, tagId);
    await ctx.system(() => ctx.sql`update tags set color = ${input.color} where id = ${tag.id}`);
    return toTag({ ...tag, color: input.color });
  });
}

/** Etiketi siler; bütün lead'lerden de kalkar. Yalnız yönetici. */
export function deleteTag(ws: string, tagId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const tag = await findTag(ctx, tagId);
    await ctx.system(() => ctx.sql`delete from tags where id = ${tag.id}`);
  });
}

export function createTag(ws: string, input: { name: string; color?: StageColor }): Promise<Tag> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const name = input.name.trim();
    // Etiket adı büyük/küçük harf duyarsız tekildir ("VIP" varken "vip" eklenemez); dizin de aynısını zorlar.
    const [clash] = await sql`select 1 from tags where workspace_id = ${ctx.ws.id} and entity_type = 'lead' and app.fold(name) = app.fold(${name})`;
    if (clash) throw new DataError(409, "tag_exists");
    const [tag] = await sql<Array<{ id: Id; name: string; color: StageColor | null }>>`
      insert into tags (workspace_id, entity_type, name, color, created_by)
      values (${ctx.ws.id}, 'lead', ${name}, ${input.color ?? null}, ${ctx.user.id}) returning id, name, color`;
    return toTag(tag);
  });
}

