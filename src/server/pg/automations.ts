// Aşamaya bağlı tetikleyiciler: tanımları ve çalıştırılmaları.
//
// Bir olay (lead bir aşamada oluşturuldu ya da bir aşamaya taşındı) o aşamadaki etkin tetikleyicileri sırayla
// çalıştırır. Şimdilik olayla aynı işlemin içinde, gecikmesiz çalışırlar; gecikmeli tetikleyiciler iş kuyruğu
// bağlandığında gelecek. Bir tetikleyicinin hatası olayı (ör. lead'in taşınmasını) geri almaz.
import { randomUUID } from "node:crypto";
import type { Automation, AutomationEvent, AutomationInput, Id } from "@/lib/types";
import type { Tx } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { inWorkspace, requireAdmin, type Ctx } from "./ctx";
import { findStage, loadPipeline } from "./shared";

/** Tetikleyiciler birbirini zincirleme çalıştırabilir (A taşır, B geri taşır). Bu derinlikten sonra zincir kesilir. */
const MAX_DEPTH = 5;

type Row = Automation & { rrCursor: number };

/* ---------- çalıştırma ---------- */

/**
 * Olayı karşılayan tetikleyicileri çalıştırır. Çağıran sunucu rolünde olmalıdır: tetikleyici, olayı başlatan
 * kullanıcının göremediği kayıtlara da (ör. başkasına atanan lead) yazabilmelidir.
 */
export async function fireAutomations(sql: Tx, wsId: Id, event: { type: AutomationEvent; leadId: Id; stageId: Id; depth?: number }): Promise<void> {
  const depth = event.depth ?? 0;
  const automations = await sql<Row[]>`
    select id, pipeline_id, stage_id, on_event, kind, settings, is_active, sort, rr_cursor
    from automations
    where workspace_id = ${wsId} and stage_id = ${event.stageId} and on_event = ${event.type} and is_active
    order by sort, created_at, id`;
  const key = `${event.type}:${randomUUID()}`;
  for (const automation of automations) {
    const [run] = await sql<Array<{ id: Id }>>`
      insert into automation_runs (workspace_id, automation_id, lead_id, dedupe_key, depth, status, started_at)
      values (${wsId}, ${automation.id}, ${event.leadId}, ${key}, ${depth}, 'running', now())
      on conflict (automation_id, lead_id, dedupe_key) do nothing
      returning id`;
    if (!run) continue;
    let status: "done" | "skipped" | "failed" = "failed";
    let error: string | null = null;
    try {
      // Kayıt noktası: tetikleyicinin veritabanı hatası yalnız kendi yazdıklarını geri alır.
      status = (await sql.savepoint((inner) => execute(inner as unknown as Tx, wsId, automation, event.leadId, depth))) as "done" | "skipped";
    } catch (problem) {
      error = problem instanceof Error ? problem.message.slice(0, 500) : "unknown error";
    }
    await sql`update automation_runs set status = ${status}, error = ${error}, finished_at = now() where id = ${run.id}`;
  }
}

async function logByAutomation(sql: Tx, wsId: Id, leadId: Id, type: string, from: string | null, to: string | null): Promise<void> {
  await sql`
    insert into events (workspace_id, type, lead_id, actor_kind, value_before, value_after)
    values (${wsId}, ${type}, ${leadId}, 'automation', ${from === null ? null : sql.json({ text: from })}, ${to === null ? null : sql.json({ text: to })})`;
}

/** "done": bir şey değişti. "skipped": koşul tutmadı ya da yapılacak bir şey yoktu. */
async function execute(sql: Tx, wsId: Id, automation: Row, leadId: Id, depth: number): Promise<"done" | "skipped"> {
  const [lead] = await sql<Array<{ id: Id; pipelineId: Id; stageId: Id; responsibleUserId: Id | null }>>`
    select id, pipeline_id, stage_id, responsible_user_id from leads where id = ${leadId} and workspace_id = ${wsId} and deleted_at is null for update`;
  if (!lead) return "skipped";

  switch (automation.kind) {
    case "change_responsible": {
      const settings = automation.settings;
      const wanted = settings.mode === "user" ? [settings.userId] : settings.userIds;
      const members = await sql<Array<{ id: Id; name: string }>>`
        select p.id, p.full_name as name from workspace_members m join profiles p on p.id = m.user_id
        where m.workspace_id = ${wsId} and m.is_active and m.user_id in ${sql(wanted.filter(isUuid))}`;
      // Listedeki sıra korunur; artık üye olmayan ya da pasif kullanıcılar atlanır.
      const candidates = wanted.map((id) => members.find((member) => member.id === id)).filter((member) => member !== undefined);
      if (candidates.length === 0) return "skipped";
      let target = candidates[0];
      if (settings.mode === "round_robin") {
        // Sırayla dağıtım yalnız sahipsiz lead'lere uygulanır: elle atanmış bir lead'i başkasına vermez.
        if (lead.responsibleUserId !== null) return "skipped";
        // İmleç tek sorguda artırılıp okunur: iki lead aynı anda gelse de aynı kişiye düşmez.
        const [{ rrCursor }] = await sql<Array<{ rrCursor: number }>>`
          update automations set rr_cursor = rr_cursor + 1 where id = ${automation.id} returning rr_cursor`;
        target = candidates[(rrCursor - 1) % candidates.length];
      }
      if (lead.responsibleUserId === target.id) return "skipped";
      await sql`update leads set responsible_user_id = ${target.id}, updated_at = now() where id = ${lead.id}`;
      await sql`update conversations set assigned_user_id = ${target.id} where lead_id = ${lead.id} and assigned_user_id is null`;
      await logByAutomation(sql, wsId, lead.id, "responsible_changed", null, target.name);
      return "done";
    }
    case "add_task": {
      const settings = automation.settings;
      const [type] = await sql<Array<{ id: Id; name: string }>>`select id, name from task_types where id = ${settings.typeId} and workspace_id = ${wsId}`;
      if (!type) return "skipped";
      let responsible = settings.responsible === "lead" ? lead.responsibleUserId : settings.responsible;
      if (responsible !== null) {
        const [member] = await sql`select 1 from workspace_members where workspace_id = ${wsId} and user_id = ${responsible} and is_active`;
        if (!member) responsible = null;
      }
      await sql`
        insert into tasks (workspace_id, lead_id, task_type_id, text, due_at, responsible_user_id)
        values (${wsId}, ${lead.id}, ${type.id}, ${settings.text}, now() + make_interval(mins => ${settings.dueInMinutes}), ${responsible})`;
      await logByAutomation(sql, wsId, lead.id, "task_added", null, settings.text || type.name);
      return "done";
    }
    case "change_stage": {
      const [target] = await sql<Array<{ id: Id; name: string; pipelineId: Id; kind: string }>>`
        select id, name, pipeline_id, kind from stages where id = ${automation.settings.stageId} and workspace_id = ${wsId}`;
      if (!target || target.pipelineId !== lead.pipelineId || target.kind === "incoming" || target.id === lead.stageId) return "skipped";
      const [from] = await sql<Array<{ name: string }>>`select name from stages where id = ${lead.stageId}`;
      await sql`update leads set stage_id = ${target.id}, updated_at = now() where id = ${lead.id}`;
      await logByAutomation(sql, wsId, lead.id, "stage_changed", from?.name ?? null, target.name);
      // Yeni aşamanın tetikleyicileri de çalışır; zincir belirli bir derinlikte kesilir.
      if (depth < MAX_DEPTH) await fireAutomations(sql, wsId, { type: "stage_entered", leadId: lead.id, stageId: target.id, depth: depth + 1 });
      return "done";
    }
    case "edit_tags": {
      const { add, remove } = automation.settings;
      const valid = add.filter(isUuid);
      const tags = valid.length
        ? await sql<Array<{ id: Id }>>`select id from tags where workspace_id = ${wsId} and entity_type = 'lead' and id in ${sql(valid)}`
        : [];
      let changed = 0;
      for (const tag of tags) {
        const inserted = await sql`
          insert into taggings (workspace_id, tag_id, lead_id) values (${wsId}, ${tag.id}, ${lead.id})
          on conflict (tag_id, lead_id) where lead_id is not null do nothing returning id`;
        changed += inserted.length;
      }
      const drop = remove.filter(isUuid);
      if (drop.length > 0) {
        const deleted = await sql`delete from taggings where lead_id = ${lead.id} and tag_id in ${sql(drop)} returning id`;
        changed += deleted.length;
      }
      if (changed === 0) return "skipped";
      await sql`update leads set updated_at = now() where id = ${lead.id}`;
      return "done";
    }
  }
}

/* ---------- tanımlar ---------- */

async function rows(ctx: Ctx, where: ReturnType<Ctx["sql"]>): Promise<Automation[]> {
  const list = await ctx.sql<Row[]>`
    select id, pipeline_id, stage_id, on_event, kind, settings, is_active, sort, rr_cursor
    from automations where workspace_id = ${ctx.ws.id} ${where}
    order by sort, created_at, id`;
  return list.map((row) => {
    const { rrCursor, ...automation } = row;
    void rrCursor;
    return automation as Automation;
  });
}

async function findAutomation(ctx: Ctx, automationId: Id): Promise<Automation> {
  if (!isUuid(automationId)) throw notFound("automation");
  const [automation] = await rows(ctx, ctx.sql`and id = ${automationId}`);
  if (!automation) throw notFound("automation");
  return automation;
}

/** Ayarların bu çalışma alanındaki kayıtları gösterdiğini doğrular. Başka kiracının kimliği "bulunamadı" sayılır. */
async function checkSettings(ctx: Ctx, pipelineId: Id, action: AutomationInput): Promise<void> {
  const { sql, ws } = ctx;
  const members = async (ids: Id[]) => {
    if (ids.some((id) => !isUuid(id))) throw notFound("user");
    const found = await sql`select 1 from workspace_members where workspace_id = ${ws.id} and is_active and user_id in ${sql(ids)}`;
    if (found.length !== new Set(ids).size) throw notFound("user");
  };
  switch (action.kind) {
    case "change_responsible":
      await members(action.settings.mode === "user" ? [action.settings.userId] : action.settings.userIds);
      break;
    case "add_task": {
      if (!isUuid(action.settings.typeId)) throw notFound("task type");
      const [type] = await sql`select 1 from task_types where id = ${action.settings.typeId} and workspace_id = ${ws.id}`;
      if (!type) throw notFound("task type");
      if (action.settings.responsible !== "lead") await members([action.settings.responsible]);
      break;
    }
    case "change_stage": {
      const target = await findStage(ctx, action.settings.stageId);
      if (target.pipelineId !== pipelineId) throw new DataError(422, "invalid_stage", "target stage belongs to another pipeline");
      if (target.kind === "incoming") throw new DataError(422, "invalid_stage", "cannot move into the incoming stage");
      if (target.id === action.stageId) throw new DataError(422, "invalid_stage", "target stage is the trigger's own stage");
      break;
    }
    case "edit_tags": {
      const ids = [...new Set([...action.settings.add, ...action.settings.remove])];
      if (ids.length === 0) throw new DataError(422, "validation", "no tags selected");
      if (ids.some((id) => !isUuid(id))) throw notFound("tag");
      const found = await sql`select 1 from tags where workspace_id = ${ws.id} and entity_type = 'lead' and id in ${sql(ids)}`;
      if (found.length !== ids.length) throw notFound("tag");
      break;
    }
  }
}

export function listAutomations(ws: string, pipelineId?: Id): Promise<Automation[]> {
  return inWorkspace(ws, async (ctx) => {
    const pipeline = await loadPipeline(ctx, pipelineId);
    return rows(ctx, ctx.sql`and pipeline_id = ${pipeline.id}`);
  });
}

export function createAutomation(ws: string, input: AutomationInput): Promise<Automation> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const stage = await findStage(ctx, input.stageId);
    await checkSettings(ctx, stage.pipelineId, input);
    const [{ sort }] = await ctx.sql<Array<{ sort: number }>>`
      select coalesce(max(sort), 0) + 10 as sort from automations where stage_id = ${stage.id}`;
    const [created] = await ctx.sql<Array<{ id: Id }>>`
      insert into automations (workspace_id, pipeline_id, stage_id, kind, on_event, settings, sort, is_active, created_by)
      values (${ctx.ws.id}, ${stage.pipelineId}, ${stage.id}, ${input.kind}, ${input.onEvent}, ${ctx.sql.json(input.settings)}, ${sort},
              ${input.isActive ?? true}, ${ctx.user.id})
      returning id`;
    return findAutomation(ctx, created.id);
  });
}

/** Ayarlar değişirse tür de birlikte gönderilir; yalnız aç/kapat için isActive yeterlidir. */
export function updateAutomation(ws: string, automationId: Id, input: Partial<AutomationInput>): Promise<Automation> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const current = await findAutomation(ctx, automationId);
    const next = { ...current, ...input } as Automation & AutomationInput;
    if (input.stageId !== undefined && input.stageId !== current.stageId) {
      const stage = await findStage(ctx, input.stageId);
      if (stage.pipelineId !== current.pipelineId) throw new DataError(422, "invalid_stage", "stage belongs to another pipeline");
    }
    if (input.kind !== undefined || input.settings !== undefined || input.stageId !== undefined) await checkSettings(ctx, current.pipelineId, next);
    await ctx.sql`
      update automations set stage_id = ${next.stageId}, kind = ${next.kind}, on_event = ${next.onEvent},
        settings = ${ctx.sql.json(next.settings)}, is_active = ${next.isActive}
      where id = ${current.id}`;
    return findAutomation(ctx, current.id);
  });
}

export function deleteAutomation(ws: string, automationId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const automation = await findAutomation(ctx, automationId);
    await ctx.sql`delete from automations where id = ${automation.id}`;
  });
}
