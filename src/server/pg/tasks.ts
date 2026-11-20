// Görevler. Bir görev tam olarak bir kayda (lead, kişi ya da şirket) bağlıdır; veritabanı da bunu zorlar.
import type { CreateTaskInput, Id, Task, TaskFilter, TaskType } from "@/lib/types";
import type { Fragment } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { checkUser, handoff, inWorkspace, logEvent, requireAdmin, type Ctx } from "./ctx";
import { requireCan } from "./rights";

type TaskRow = Omit<Task, "responsible" | "target"> & {
  responsibleId: Id | null;
  responsibleName: string | null;
  leadId: Id | null;
  contactId: Id | null;
  companyId: Id | null;
  targetName: string;
};

/** Bağlı olduğu kayıt silinmiş olan görevler hiçbir listede görünmez. where "and ..." ile başlar. */
async function taskRows(ctx: Ctx, where: Fragment): Promise<Array<Task & { leadId: Id | null }>> {
  const rows = await ctx.sql<TaskRow[]>`
    select t.id, t.task_type_id as type_id, tt.name as type_name, t.text, t.due_at, t.completed_at, t.result_text, t.created_at,
      p.id as responsible_id, p.full_name as responsible_name,
      t.lead_id, t.contact_id, t.company_id,
      coalesce(l.name, c.name, co.name) as target_name
    from tasks t
    join task_types tt on tt.id = t.task_type_id
    left join profiles p on p.id = t.responsible_user_id
    left join leads l on l.id = t.lead_id and l.deleted_at is null
    left join contacts c on c.id = t.contact_id and c.deleted_at is null
    left join companies co on co.id = t.company_id and co.deleted_at is null
    where t.workspace_id = ${ctx.ws.id} and coalesce(l.id, c.id, co.id) is not null ${where}
    order by t.due_at, t.id`;
  return rows.map((row) => ({
    id: row.id,
    typeId: row.typeId,
    typeName: row.typeName,
    text: row.text,
    dueAt: row.dueAt,
    responsible: row.responsibleId ? { id: row.responsibleId, name: row.responsibleName ?? "" } : null,
    completedAt: row.completedAt,
    resultText: row.resultText,
    target: row.leadId
      ? { kind: "lead", id: row.leadId, name: row.targetName }
      : row.contactId
        ? { kind: "contact", id: row.contactId, name: row.targetName }
        : { kind: "company", id: row.companyId!, name: row.targetName },
    createdAt: row.createdAt,
    leadId: row.leadId,
  }));
}

/** Olay günlüğü için taşınan leadId'yi API yanıtından çıkarır. */
function strip(row: Task & { leadId: Id | null }): Task {
  const { leadId, ...task } = row;
  void leadId;
  return task;
}

async function findTask(ctx: Ctx, taskId: Id, lock = false): Promise<Task & { leadId: Id | null }> {
  if (!isUuid(taskId)) throw notFound("task");
  if (lock) await ctx.sql`select 1 from tasks where id = ${taskId} and workspace_id = ${ctx.ws.id} for update`;
  const [task] = await taskRows(ctx, ctx.sql`and t.id = ${taskId}`);
  if (!task) throw notFound("task");
  return task;
}

async function findType(ctx: Ctx, typeId: Id): Promise<{ id: Id; name: string }> {
  if (!isUuid(typeId)) throw notFound("task type");
  const [type] = await ctx.sql<Array<{ id: Id; name: string }>>`select id, name from task_types where id = ${typeId} and workspace_id = ${ctx.ws.id}`;
  if (!type) throw notFound("task type");
  return type;
}

function checkDue(dueAt: string): string {
  const time = Date.parse(dueAt);
  if (Number.isNaN(time)) throw new DataError(422, "invalid_due");
  return new Date(time).toISOString();
}

async function exists(ctx: Ctx, table: "leads" | "contacts" | "companies", id: Id, what: string): Promise<void> {
  if (!isUuid(id)) throw notFound(what);
  const [row] = await ctx.sql`select 1 from ${ctx.sql(table)} where id = ${id} and workspace_id = ${ctx.ws.id} and deleted_at is null`;
  if (!row) throw notFound(what);
}

export function listTasks(ws: string, filter: TaskFilter = {}): Promise<Task[]> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    const none = sql`and false`;
    const parts: Fragment[] = [];
    const status = filter.status ?? "open";
    if (status === "open") parts.push(sql`and t.completed_at is null`);
    if (status === "done") parts.push(sql`and t.completed_at is not null`);
    if (filter.responsible === "me") parts.push(sql`and t.responsible_user_id = ${user.id}`);
    else if (filter.responsible) parts.push(isUuid(filter.responsible) ? sql`and t.responsible_user_id = ${filter.responsible}` : none);
    if (filter.leadId) parts.push(isUuid(filter.leadId) ? sql`and t.lead_id = ${filter.leadId}` : none);
    if (filter.contactId) parts.push(isUuid(filter.contactId) ? sql`and t.contact_id = ${filter.contactId}` : none);
    if (filter.companyId) parts.push(isUuid(filter.companyId) ? sql`and t.company_id = ${filter.companyId}` : none);
    if (filter.from) parts.push(Number.isNaN(Date.parse(filter.from)) ? none : sql`and t.due_at >= ${filter.from}`);
    if (filter.to) parts.push(Number.isNaN(Date.parse(filter.to)) ? none : sql`and t.due_at <= ${filter.to}`);
    const rows = await taskRows(ctx, parts.reduce<Fragment>((all, part) => sql`${all} ${part}`, sql``));
    return rows.map(strip);
  });
}

export function createTask(ws: string, input: CreateTaskInput): Promise<Task> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    const targets = [input.leadId, input.contactId, input.companyId].filter(Boolean);
    if (targets.length !== 1) throw new DataError(422, "task_target", "a task belongs to exactly one record");
    if (input.leadId) await exists(ctx, "leads", input.leadId, "lead");
    if (input.contactId) await exists(ctx, "contacts", input.contactId, "contact");
    if (input.companyId) await exists(ctx, "companies", input.companyId, "company");
    const type = await findType(ctx, input.typeId);
    const dueAt = checkDue(input.dueAt);
    const responsible = input.responsibleUserId === undefined ? user.id : await checkUser(ctx, input.responsibleUserId);
    const text = (input.text ?? "").trim();

    // Lead'in en yakın görev zamanı (panodaki "görev yok" uyarısı) tetikleyicide güncellenir.
    const [created] = await handoff(
      ctx,
      responsible,
      () => sql<Array<{ id: Id }>>`
        insert into tasks (workspace_id, lead_id, contact_id, company_id, task_type_id, text, due_at, responsible_user_id, created_by)
        values (${ctx.ws.id}, ${input.leadId ?? null}, ${input.contactId ?? null}, ${input.companyId ?? null}, ${type.id}, ${text}, ${dueAt}, ${responsible}, ${user.id})
        returning id`,
    );
    if (input.leadId) await logEvent(ctx, { leadId: input.leadId, type: "task_added", to: text || type.name });
    return strip(await handoff(ctx, responsible, () => findTask(ctx, created.id)));
  });
}

export function updateTask(ws: string, taskId: Id, input: { typeId?: Id; text?: string; dueAt?: string; responsibleUserId?: Id | null }): Promise<Task> {
  return inWorkspace(ws, async (ctx) => {
    const task = await findTask(ctx, taskId, true);
    await requireCan(ctx, "tasks", "edit", task.responsible?.id ?? null);
    if (task.completedAt !== null) throw new DataError(409, "task_completed");
    const typeId = input.typeId !== undefined ? (await findType(ctx, input.typeId)).id : task.typeId;
    const dueAt = input.dueAt !== undefined ? checkDue(input.dueAt) : task.dueAt;
    const responsible = input.responsibleUserId !== undefined ? await checkUser(ctx, input.responsibleUserId) : (task.responsible?.id ?? null);
    await handoff(
      ctx,
      responsible,
      () => ctx.sql`
        update tasks set task_type_id = ${typeId}, due_at = ${dueAt}, responsible_user_id = ${responsible},
          text = ${input.text !== undefined ? input.text.trim() : task.text}
        where id = ${task.id}`,
    );
    return strip(await handoff(ctx, responsible, () => findTask(ctx, task.id)));
  });
}

/** Görevi sonuç metniyle tamamlar. Tamamlanmış görev yeniden tamamlanamaz. */
export function completeTask(ws: string, taskId: Id, input: { resultText?: string }): Promise<Task> {
  return inWorkspace(ws, async (ctx) => {
    const task = await findTask(ctx, taskId, true);
    await requireCan(ctx, "tasks", "edit", task.responsible?.id ?? null);
    if (task.completedAt !== null) throw new DataError(409, "task_completed");
    const resultText = input.resultText?.trim() || null;
    await ctx.sql`update tasks set completed_at = now(), completed_by = ${ctx.user.id}, result_text = ${resultText} where id = ${task.id}`;
    if (task.leadId) await logEvent(ctx, { leadId: task.leadId, type: "task_completed", from: resultText, to: task.text || task.typeName });
    return strip(await findTask(ctx, task.id));
  });
}

export function deleteTask(ws: string, taskId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    const task = await findTask(ctx, taskId, true);
    await requireCan(ctx, "tasks", "delete", task.responsible?.id ?? null);
    await ctx.sql`delete from tasks where id = ${task.id}`;
  });
}

/* ---------- özel görev türleri (yalnız yönetici yazar) ---------- */

/** Hazır türlerin (Takip, Toplantı) yanına çalışma alanının kendi türünü ekler. */
export function createTaskType(ws: string, input: { name: string }): Promise<TaskType> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const [{ sort }] = await ctx.sql<Array<{ sort: number }>>`select coalesce(max(sort), 0) + 10 as sort from task_types where workspace_id = ${ctx.ws.id}`;
    const [type] = await ctx.sql<TaskType[]>`
      insert into task_types (workspace_id, name, is_system, sort) values (${ctx.ws.id}, ${input.name.trim()}, false, ${sort})
      returning id, name, is_system`;
    return { ...type };
  });
}

/** Yalnız özel türler adlandırılır; hazır türler değişmez. */
export function updateTaskType(ws: string, typeId: Id, input: { name: string }): Promise<TaskType> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(typeId)) throw notFound("task type");
    const [type] = await ctx.sql<TaskType[]>`
      update task_types set name = ${input.name.trim()}
      where id = ${typeId} and workspace_id = ${ctx.ws.id} and not is_system
      returning id, name, is_system`;
    if (!type) throw notFound("task type");
    return { ...type };
  });
}

/**
 * Özel türü siler. Bu türdeki görevler silinmez: ilk hazır türe geçer. Bir tetikleyici bu türle görev ekliyorsa
 * silme reddedilir; yoksa o tetikleyici sessizce çalışmaz hale gelirdi.
 */
export function deleteTaskType(ws: string, typeId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(typeId)) throw notFound("task type");
    const [type] = await ctx.sql`select 1 from task_types where id = ${typeId} and workspace_id = ${ctx.ws.id} and not is_system`;
    if (!type) throw notFound("task type");
    const [used] = await ctx.sql`
      select 1 from automations where workspace_id = ${ctx.ws.id} and kind = 'add_task' and settings->>'typeId' = ${typeId} limit 1`;
    if (used) throw new DataError(409, "task_type_in_use");
    const [fallback] = await ctx.sql<Array<{ id: Id }>>`
      select id from task_types where workspace_id = ${ctx.ws.id} and is_system order by sort, created_at limit 1`;
    await ctx.system(async () => {
      if (fallback) await ctx.sql`update tasks set task_type_id = ${fallback.id} where workspace_id = ${ctx.ws.id} and task_type_id = ${typeId}`;
      await ctx.sql`delete from task_types where id = ${typeId} and workspace_id = ${ctx.ws.id}`;
    });
  });
}

