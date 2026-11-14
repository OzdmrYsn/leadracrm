// Özel alan tanımları. Yalnız yönetici yazar. Değerler kayıtların "custom" sütununda durur.
import { fold } from "@/lib/text";
import type { CustomField, CustomFieldType, EntityType, Id } from "@/lib/types";
import { DataError, isUuid, notFound } from "../errors";
import { loadFields } from "./custom";
import { inWorkspace, requireAdmin, type Ctx } from "./ctx";

const MAX_FIELDS = 100;
const MAX_OPTIONS = 100;

const hasOptions = (type: CustomFieldType) => type === "select" || type === "multiselect";
const TABLE: Record<EntityType, "leads" | "contacts" | "companies"> = { lead: "leads", contact: "contacts", company: "companies" };

async function findField(ctx: Ctx, fieldId: Id): Promise<CustomField> {
  if (!isUuid(fieldId)) throw notFound("field");
  const [row] = await ctx.sql<Array<{ entityType: EntityType }>>`
    select entity_type from custom_fields where id = ${fieldId} and workspace_id = ${ctx.ws.id}`;
  if (!row) throw notFound("field");
  return (await loadFields(ctx, row.entityType)).find((field) => field.id === fieldId)!;
}

/** Aynı kayıt türünde alan adı büyük/küçük harf duyarsız tekildir; veritabanındaki dizin de aynısını zorlar. */
function checkName(siblings: CustomField[], name: string, exceptId?: Id): void {
  if (siblings.some((field) => field.id !== exceptId && fold(field.name) === fold(name))) throw new DataError(409, "field_exists");
}

function cleanLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const unique = labels
    .map((label) => label.trim())
    .filter((label) => {
      if (label === "" || seen.has(fold(label))) return false;
      seen.add(fold(label));
      return true;
    });
  if (unique.length > MAX_OPTIONS) throw new DataError(422, "validation", "too many options");
  return unique;
}

export function listFields(ws: string, entityType: EntityType): Promise<CustomField[]> {
  return inWorkspace(ws, (ctx) => loadFields(ctx, entityType));
}

export function createField(ws: string, input: { entityType: EntityType; name: string; type: CustomFieldType; options?: string[] }): Promise<CustomField> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    requireAdmin(ctx);
    const siblings = await loadFields(ctx, input.entityType);
    if (siblings.length >= MAX_FIELDS) throw new DataError(422, "field_limit");
    checkName(siblings, input.name);
    const labels = hasOptions(input.type) ? cleanLabels(input.options ?? []) : [];
    if (hasOptions(input.type) && labels.length === 0) throw new DataError(422, "options_required");
    const [created] = await sql<Array<{ id: Id }>>`
      insert into custom_fields (workspace_id, entity_type, name, type, sort)
      values (${ctx.ws.id}, ${input.entityType}, ${input.name.trim()}, ${input.type}, ${Math.max(0, ...siblings.map((item) => item.sort)) + 10})
      returning id`;
    for (const [index, label] of labels.entries()) {
      await sql`insert into custom_field_options (workspace_id, field_id, value, sort) values (${ctx.ws.id}, ${created.id}, ${label}, ${(index + 1) * 10})`;
    }
    return findField(ctx, created.id);
  });
}

/**
 * Adı ve seçenekleri günceller; tür değişmez. Seçenekler etiketle eşleştirilir: aynı etiket kimliğini korur,
 * yeni etiket yeni kimlik alır, listeden çıkan seçenek kayıtlardaki değerlerden de silinir.
 */
export function updateField(ws: string, fieldId: Id, input: { name?: string; options?: string[] }): Promise<CustomField> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    requireAdmin(ctx);
    const field = await findField(ctx, fieldId);
    if (input.name !== undefined) checkName(await loadFields(ctx, field.entityType), input.name, field.id);

    if (input.options !== undefined && hasOptions(field.type)) {
      const labels = cleanLabels(input.options);
      if (labels.length === 0) throw new DataError(422, "options_required");
      const kept = new Set<Id>();
      for (const [index, label] of labels.entries()) {
        const existing = field.options.find((option) => fold(option.label) === fold(label));
        if (existing) {
          kept.add(existing.id);
          await sql`update custom_field_options set value = ${label}, sort = ${(index + 1) * 10} where id = ${existing.id}`;
        } else {
          await sql`insert into custom_field_options (workspace_id, field_id, value, sort) values (${ctx.ws.id}, ${field.id}, ${label}, ${(index + 1) * 10})`;
        }
      }
      const removed = field.options.filter((option) => !kept.has(option.id)).map((option) => option.id);
      if (removed.length > 0) {
        await sql`delete from custom_field_options where id in ${sql(removed)}`;
        await dropOptionValues(ctx, field, removed);
      }
    }
    if (input.name !== undefined) await sql`update custom_fields set name = ${input.name.trim()} where id = ${field.id}`;
    return findField(ctx, field.id);
  });
}

/** Silinen seçenekleri kayıtlardaki değerlerden çıkarır; değer boşalırsa alan kayıttan kalkar. */
async function dropOptionValues(ctx: Ctx, field: CustomField, removed: Id[]): Promise<void> {
  const { sql } = ctx;
  const table = sql(TABLE[field.entityType]);
  const rows = await sql<Array<{ id: Id; value: string | string[] }>>`
    select id, custom -> ${field.id} as value from ${table} where workspace_id = ${ctx.ws.id} and custom ? ${field.id}`;
  for (const row of rows) {
    const next = Array.isArray(row.value) ? row.value.filter((id) => !removed.includes(id)) : removed.includes(row.value) ? [] : null;
    if (next === null) continue;
    if (next.length === 0) await sql`update ${table} set custom = custom - ${field.id} where id = ${row.id}`;
    else if (Array.isArray(row.value) && next.length !== row.value.length) {
      await sql`update ${table} set custom = jsonb_set(custom, ${[field.id]}, ${sql.json(next)}) where id = ${row.id}`;
    }
  }
}

export function reorderFields(ws: string, entityType: EntityType, orderedIds: Id[]): Promise<CustomField[]> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const fields = await loadFields(ctx, entityType);
    const same = orderedIds.length === fields.length && fields.every((field) => orderedIds.includes(field.id));
    if (!same) throw new DataError(422, "invalid_order");
    for (const [index, id] of orderedIds.entries()) {
      await ctx.sql`update custom_fields set sort = ${(index + 1) * 10} where id = ${id} and workspace_id = ${ctx.ws.id}`;
    }
    return loadFields(ctx, entityType);
  });
}

/** Alanı ve o alanın bütün kayıtlardaki değerlerini siler. */
export function deleteField(ws: string, fieldId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    requireAdmin(ctx);
    const field = await findField(ctx, fieldId);
    await sql`update ${sql(TABLE[field.entityType])} set custom = custom - ${field.id} where workspace_id = ${ctx.ws.id} and custom ? ${field.id}`;
    await sql`delete from custom_fields where id = ${field.id}`;
  });
}
