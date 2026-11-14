// Özel alan tanımlarını okur ve değerleri türüne göre doğrular. Değerler kayıtların "custom" sütununda durur.
import { isDay } from "@/lib/dates";
import type { CustomField, CustomValue, CustomValues, EntityType } from "@/lib/types";
import { DataError, notFound } from "../errors";
import type { Ctx } from "./ctx";

export async function loadFields(ctx: Ctx, entityType: EntityType): Promise<CustomField[]> {
  const rows = await ctx.sql<CustomField[]>`
    select f.id, f.entity_type, f.name, f.type, f.sort,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.value) order by o.sort, o.created_at, o.id)
        from custom_field_options o where o.field_id = f.id), '[]'::jsonb) as options
    from custom_fields f
    where f.workspace_id = ${ctx.ws.id} and f.entity_type = ${entityType}
    order by f.sort, f.created_at, f.id`;
  return rows.map((row) => ({ ...row }));
}

const invalidValue = (field: CustomField) => new DataError(422, "invalid_field_value", `invalid value for field ${field.id} (${field.type})`);

function normalizeValue(field: CustomField, value: CustomValue): CustomValue {
  if (value === null) return null;
  switch (field.type) {
    case "text": {
      if (typeof value !== "string") throw invalidValue(field);
      return value.trim() === "" ? null : value.trim().slice(0, 2000);
    }
    case "url": {
      if (typeof value !== "string") throw invalidValue(field);
      const text = value.trim();
      if (text === "") return null;
      if (!/^https?:\/\/\S+$/i.test(text)) throw invalidValue(field);
      return text;
    }
    case "numeric":
      if (typeof value !== "number" || !Number.isFinite(value)) throw invalidValue(field);
      return value;
    case "checkbox":
      if (typeof value !== "boolean") throw invalidValue(field);
      return value;
    case "date":
      if (typeof value !== "string" || !isDay(value)) throw invalidValue(field);
      return value;
    case "select":
      if (typeof value !== "string" || !field.options.some((option) => option.id === value)) throw invalidValue(field);
      return value;
    case "multiselect": {
      if (!Array.isArray(value) || value.some((id) => !field.options.some((option) => option.id === id))) throw invalidValue(field);
      const unique = [...new Set(value)];
      return unique.length === 0 ? null : unique;
    }
    default:
      // Şemada tanımlı ama arayüzde henüz desteklenmeyen türler.
      throw invalidValue(field);
  }
}

/** Değerleri doğrular ve mevcut değerlerin üzerine yazar. null alanı boşaltır. Bir değer geçersizse hiçbiri yazılmaz. */
export async function applyCustom(ctx: Ctx, entityType: EntityType, current: CustomValues, patch: CustomValues): Promise<CustomValues> {
  const fields = await loadFields(ctx, entityType);
  const next = { ...current };
  for (const [fieldId, value] of Object.entries(patch)) {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) throw notFound("field");
    const normalized = normalizeValue(field, value);
    if (normalized === null) delete next[fieldId];
    else next[fieldId] = normalized;
  }
  return next;
}
