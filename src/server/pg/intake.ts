// Dışarıdan lead alma kapısı. Google Sheets betiği, reklam formu, Zapier/Make ya da müşterinin kendi sistemi
// kapının gizli adresine veri gönderir; hedef aşamada lead oluşur ve o aşamanın otomasyonları çalışır.
import { createHash, randomBytes } from "node:crypto";
import { isDay } from "@/lib/dates";
import { parseMoney } from "@/lib/format";
import { LEAD_COLUMN_ALIASES, LEAD_SLOTS } from "@/lib/lead-columns";
import { fold } from "@/lib/text";
import type { CustomField, CustomValues, Id, Intake, IntakeInput } from "@/lib/types";
import { asService, type Tx } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { fireAutomations } from "./automations";
import { checkUser, inWorkspace, requireAdmin, type Ctx } from "./ctx";
import { findStage } from "./shared";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

/* ---------- tanımlar (yalnız yönetici yazar) ---------- */

async function rows(ctx: Ctx, where: ReturnType<Ctx["sql"]>): Promise<Intake[]> {
  // token_hash bilerek seçilmez: gizli adresin özeti bile istemciye gitmez.
  const list = await ctx.sql<Intake[]>`
    select id, name, kind, provider, pipeline_id, stage_id, tag_id, is_active, last_received_at, last_error, created_at
    from lead_intakes where workspace_id = ${ctx.ws.id} ${where}
    order by created_at, id`;
  return list.map((row) => ({ ...row }));
}

async function findIntake(ctx: Ctx, intakeId: Id): Promise<Intake> {
  if (!isUuid(intakeId)) throw notFound("intake");
  const [intake] = await rows(ctx, ctx.sql`and id = ${intakeId}`);
  if (!intake) throw notFound("intake");
  return intake;
}

async function checkTarget(ctx: Ctx, stageId: Id, tagId: Id | null | undefined) {
  const stage = await findStage(ctx, stageId);
  if (stage.kind === "won" || stage.kind === "lost") throw new DataError(422, "invalid_stage", "leads cannot be created in a closed stage");
  if (tagId) {
    if (!isUuid(tagId)) throw notFound("tag");
    const [tag] = await ctx.sql`select 1 from tags where id = ${tagId} and workspace_id = ${ctx.ws.id} and entity_type = 'lead'`;
    if (!tag) throw notFound("tag");
  }
  return stage;
}

export function listIntakes(ws: string): Promise<Intake[]> {
  return inWorkspace(ws, (ctx) => rows(ctx, ctx.sql``));
}

/** Kapıyı oluşturur. Gizli anahtar yalnız burada döner; veritabanında yalnız özeti saklanır. */
/** Aynı işlemin içinden kapı açar (ör. Google tablosu bağlanırken). Yöneticilik denetimini çağıran yapar. */
export async function insertIntake(ctx: Ctx, input: IntakeInput): Promise<Intake> {
  const stage = await checkTarget(ctx, input.stageId, input.tagId);
  const [created] = await ctx.sql<Array<{ id: Id }>>`
    insert into lead_intakes (workspace_id, name, kind, provider, pipeline_id, stage_id, tag_id, token_hash, created_by)
    values (${ctx.ws.id}, ${input.name.trim()}, ${input.kind}, ${input.provider ?? input.kind}, ${stage.pipelineId}, ${stage.id}, ${input.tagId ?? null}, ${hashToken(newToken())}, ${ctx.user.id})
    returning id`;
  return findIntake(ctx, created.id);
}

export function createIntake(ws: string, input: IntakeInput): Promise<{ intake: Intake; token: string }> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const stage = await checkTarget(ctx, input.stageId, input.tagId);
    const token = newToken();
    const [created] = await ctx.sql<Array<{ id: Id }>>`
      insert into lead_intakes (workspace_id, name, kind, provider, pipeline_id, stage_id, tag_id, token_hash, created_by)
      values (${ctx.ws.id}, ${input.name.trim()}, ${input.kind}, ${input.provider ?? input.kind}, ${stage.pipelineId}, ${stage.id}, ${input.tagId ?? null}, ${hashToken(token)}, ${ctx.user.id})
      returning id`;
    return { intake: await findIntake(ctx, created.id), token };
  });
}

export function updateIntake(ws: string, intakeId: Id, input: { name?: string; stageId?: Id; tagId?: Id | null; isActive?: boolean }): Promise<Intake> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const intake = await findIntake(ctx, intakeId);
    const stage = await checkTarget(ctx, input.stageId ?? intake.stageId, input.tagId);
    await ctx.sql`
      update lead_intakes set
        name = ${input.name !== undefined ? input.name.trim() : intake.name},
        pipeline_id = ${stage.pipelineId},
        stage_id = ${stage.id},
        tag_id = ${input.tagId !== undefined ? input.tagId : intake.tagId},
        is_active = ${input.isActive ?? intake.isActive}
      where id = ${intake.id}`;
    return findIntake(ctx, intake.id);
  });
}

/** Gizli adresi yeniler; eski adres hemen geçersiz olur. */
export function rotateIntake(ws: string, intakeId: Id): Promise<{ intake: Intake; token: string }> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const intake = await findIntake(ctx, intakeId);
    const token = newToken();
    await ctx.sql`update lead_intakes set token_hash = ${hashToken(token)} where id = ${intake.id}`;
    return { intake, token };
  });
}

export function deleteIntake(ws: string, intakeId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const intake = await findIntake(ctx, intakeId);
    await ctx.sql`delete from lead_intakes where id = ${intake.id}`;
  });
}

/* ---------- gelen kaydın işlenmesi (herkese açık uç, sunucu rolü) ---------- */

const MAX_KEYS = 60;
const MAX_VALUE = 2000;

const ALIASES = LEAD_COLUMN_ALIASES;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text === "" ? null : text.slice(0, MAX_VALUE);
  }
  return JSON.stringify(value).slice(0, MAX_VALUE);
}

/** Dış sistemden gelen metni alanın türüne çevirir. Çevrilemezse undefined döner (değer nota yazılır). */
function toCustom(field: CustomField, text: string): CustomValues[string] | undefined {
  switch (field.type) {
    case "text":
      return text;
    case "url":
      return /^https?:\/\/\S+$/i.test(text) ? text : undefined;
    case "numeric": {
      const cleaned = text.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
      return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : undefined;
    }
    case "date": {
      const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
      const day = dotted ? `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}` : text.slice(0, 10);
      return isDay(day) ? day : undefined;
    }
    case "checkbox": {
      const value = fold(text);
      if (["evet", "true", "1", "x", "yes", "var"].includes(value)) return true;
      if (["hayir", "hayır", "false", "0", "no", "yok"].map(fold).includes(value)) return false;
      return undefined;
    }
    case "select":
      return field.options.find((option) => fold(option.label) === fold(text))?.id;
    case "multiselect": {
      const ids = text
        .split(/[,;]/)
        .map((part) => field.options.find((option) => fold(option.label) === fold(part))?.id)
        .filter((id) => id !== undefined);
      return ids.length > 0 ? ids : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Kapıya gelen bir kaydı lead'e çevirir. Aynı dış kimlik ikinci kez gelirse yeni lead açılmaz.
 * Gövde ya düz bir nesnedir ({"Ad": ..., "Telefon": ...}) ya da {"externalId": ..., "values": {...}} biçimindedir.
 */
export function receiveIntake(token: string, payload: unknown): Promise<{ leadId: Id; created: boolean }> {
  return asService((sql) => ingest(sql, sql`i.token_hash = ${hashToken(token)}`, payload));
}

/** Kapıyı kimliğiyle bulur: bağlı Google tablosundan okunan satırlar bu yoldan girer. Çağıran sunucu rolündedir. */
export function receiveForIntake(sql: Tx, intakeId: Id, payload: unknown): Promise<{ leadId: Id; created: boolean }> {
  return ingest(sql, sql`i.id = ${intakeId}`, payload);
}

async function ingest(sql: Tx, match: ReturnType<Tx>, payload: unknown): Promise<{ leadId: Id; created: boolean }> {
  {
    const [intake] = await sql<Array<{ id: Id; workspaceId: Id; name: string; pipelineId: Id; stageId: Id; tagId: Id | null; stageKind: string; currency: string }>>`
      select i.id, i.workspace_id, i.name, i.pipeline_id, i.stage_id, i.tag_id, s.kind as stage_kind, w.currency
      from lead_intakes i join stages s on s.id = i.stage_id join workspaces w on w.id = i.workspace_id
      where ${match} and i.is_active`;
    if (!intake) throw notFound("intake");
    if (!isRecord(payload)) throw new DataError(422, "validation", "body must be a JSON object");

    const source = isRecord(payload.values) ? payload.values : payload;
    const entries = Object.entries(source).filter(([key]) => !["externalId", "values"].includes(key));
    if (entries.length === 0) throw new DataError(422, "validation", "no fields in the body");
    if (entries.length > MAX_KEYS) throw new DataError(422, "validation", "too many fields");
    const given = toText(payload.externalId);
    // Dış kimlik verilmezse içerikten türetilir: aynı kayıt aynen yeniden gönderilirse yine tek lead olur.
    const externalId = (given ?? createHash("sha256").update(JSON.stringify(entries)).digest("hex")).slice(0, 255);

    const [event] = await sql<Array<{ id: Id }>>`
      insert into lead_intake_events (workspace_id, intake_id, external_id, payload)
      values (${intake.workspaceId}, ${intake.id}, ${externalId}, ${sql.json(JSON.parse(JSON.stringify(source)))})
      on conflict (intake_id, external_id) do nothing
      returning id`;
    if (!event) {
      const [previous] = await sql<Array<{ leadId: Id | null }>>`
        select lead_id from lead_intake_events where intake_id = ${intake.id} and external_id = ${externalId}`;
      if (previous?.leadId) return { leadId: previous.leadId, created: false };
      throw new DataError(409, "conflict", "this record is already being processed");
    }

    const lead = await buildLead(sql, intake, entries);
    await sql`update lead_intake_events set lead_id = ${lead}, status = 'created' where id = ${event.id}`;
    await sql`update lead_intakes set last_received_at = now(), last_error = null where id = ${intake.id}`;
    await fireAutomations(sql, intake.workspaceId, { type: "lead_created", leadId: lead, stageId: intake.stageId });
    return { leadId: lead, created: true };
  }
}

/** Lead'in nereye ve kimin adına oluşturulacağı. Kapı ve içe aktarma aynı yolu kullanır. */
type LeadTarget = {
  workspaceId: Id;
  /** Kaynağın adı: adsız lead'in adı ve not yazarı olarak kullanılır. */
  name: string;
  pipelineId: Id;
  stageId: Id;
  tagId: Id | null;
  stageKind: string;
  currency: string;
  /** İçe aktarmada: oluşturulan lead, kişi ve şirketin sorumlusu. */
  responsibleUserId?: Id | null;
  /** İçe aktarmada: işlemi yapan kullanıcı. Yoksa lead "kaynaktan oluşturuldu" diye görünür. */
  actorUserId?: Id | null;
};

type Slot = keyof typeof ALIASES;
type LeadParts = { known: Partial<Record<Slot, string>>; custom: CustomValues; extras: Array<[string, string]> };

async function leadFields(sql: Tx, wsId: Id): Promise<CustomField[]> {
  return sql<CustomField[]>`
    select f.id, f.entity_type, f.name, f.type, f.sort,
      coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.value) order by o.sort) from custom_field_options o where o.field_id = f.id), '[]'::jsonb) as options
    from custom_fields f where f.workspace_id = ${wsId} and f.entity_type = 'lead'`;
}

/** Kapıya gelen serbest biçimli kaydı ayrıştırır: sütun adı bilinen bir ada ya da bir özel alana uyuyorsa oraya, uymuyorsa nota. */
async function buildLead(sql: Tx, intake: LeadTarget, entries: Array<[string, unknown]>): Promise<Id> {
  const fields = await leadFields(sql, intake.workspaceId);
  const parts: LeadParts = { known: {}, custom: {}, extras: [] };
  for (const [key, raw] of entries) {
    const text = toText(raw);
    if (text === null) continue;
    const name = fold(key);
    const alias = (Object.keys(ALIASES) as Slot[]).find((slot) => ALIASES[slot].some((item) => fold(item) === name));
    if (alias && parts.known[alias] === undefined) {
      parts.known[alias] = text;
      continue;
    }
    // Sütun başlığı bir özel alanın adıyla aynıysa değer o alana yazılır.
    const field = fields.find((item) => fold(item.name) === name);
    const value = field ? toCustom(field, text) : undefined;
    if (field && value !== undefined) parts.custom[field.id] = value;
    else parts.extras.push([key.slice(0, 120), text]);
  }
  return createFromParts(sql, intake, parts);
}

async function createFromParts(sql: Tx, target: LeadTarget, { known, custom, extras }: LeadParts): Promise<Id> {
  const wsId = target.workspaceId;
  const owner = target.responsibleUserId ?? null;
  const actor = target.actorUserId ?? null;

  // Biçimi bozuk telefon, e-posta ve tutar kaydı düşürmez: nota yazılır, lead yine oluşur.
  let phone = known.phone ?? null;
  if (phone && !/^\+?[\d\s()-]{5,20}$/.test(phone)) {
    extras.push(["Telefon", phone]);
    phone = null;
  }
  let email = known.email?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    extras.push(["E-posta", email]);
    email = null;
  }
  let priceMinor = 0;
  if (known.price !== undefined) {
    const parsed = parseMoney(known.price);
    if (parsed === null) extras.push(["Tutar", known.price]);
    else priceMinor = parsed;
  }

  // Aynı e-posta ya da telefonla kayıtlı kişi varsa ona bağlanır; aynı kişi çoğalmaz.
  let contactId: Id | null = null;
  let companyId: Id | null = null;
  if (email || phone) {
    const digits = phone?.replace(/[^\d+]/g, "") ?? null;
    const [match] = await sql<Array<{ id: Id; companyId: Id | null }>>`
      select c.id, c.company_id from contact_handles h join contacts c on c.id = h.contact_id
      where h.workspace_id = ${wsId} and c.deleted_at is null and (
        (h.kind = 'email' and h.value = ${email})
        or (h.kind in ('phone', 'whatsapp') and regexp_replace(h.value, '[^0-9+]', '', 'g') = ${digits}))
      order by (h.kind = 'email') desc, c.created_at limit 1`;
    if (match) {
      contactId = match.id;
      companyId = match.companyId;
    }
  }
  // Şirket: aynı adla kayıtlı şirket varsa o kullanılır (büyük-küçük harf ayrımı olmadan); yoksa oluşturulur.
  // Kayıtlı kişinin zaten bir şirketi varsa ona dokunulmaz.
  if (known.company && !companyId) {
    const [existing] = await sql<Array<{ id: Id }>>`
      select id from companies where workspace_id = ${wsId} and deleted_at is null and app.fold(name) = app.fold(${known.company})
      order by created_at, id limit 1`;
    if (existing) companyId = existing.id;
    else {
      const [company] = await sql<Array<{ id: Id }>>`
        insert into companies (workspace_id, name, responsible_user_id, created_by, updated_by)
        values (${wsId}, ${known.company.slice(0, 255)}, ${owner}, ${actor}, ${actor}) returning id`;
      companyId = company.id;
    }
  }
  if (!contactId && (known.contact || email || phone)) {
    const [contact] = await sql<Array<{ id: Id }>>`
      insert into contacts (workspace_id, name, company_id, responsible_user_id, created_by, updated_by)
      values (${wsId}, ${(known.contact ?? email ?? phone ?? "").slice(0, 255)}, ${companyId}, ${owner}, ${actor}, ${actor}) returning id`;
    contactId = contact.id;
    if (phone) await sql`insert into contact_handles (workspace_id, contact_id, kind, value) values (${wsId}, ${contactId}, 'phone', ${phone})`;
    if (email) await sql`insert into contact_handles (workspace_id, contact_id, kind, value) values (${wsId}, ${contactId}, 'email', ${email})`;
  }

  const leadName = (known.name ?? (known.contact ? `${target.name}: ${known.contact}` : target.name)).slice(0, 255);
  const [lead] = await sql<Array<{ id: Id }>>`
    insert into leads (workspace_id, name, price_minor, currency, pipeline_id, stage_id, company_id, responsible_user_id, created_by, updated_by, incoming_category, custom)
    values (${wsId}, ${leadName}, ${priceMinor}, ${target.currency}, ${target.pipelineId}, ${target.stageId}, ${companyId}, ${owner}, ${actor}, ${actor},
            ${target.stageKind === "incoming" ? "form" : null}, ${sql.json(custom)})
    returning id`;
  if (contactId) await sql`insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (${wsId}, ${lead.id}, ${contactId}, true)`;
  if (target.tagId) await sql`insert into taggings (workspace_id, tag_id, lead_id) values (${wsId}, ${target.tagId}, ${lead.id})`;
  await sql`
    insert into events (workspace_id, type, lead_id, actor_kind, actor_user_id)
    values (${wsId}, 'lead_created', ${lead.id}, ${actor ? "user" : "integration"}, ${actor})`;
  if (extras.length > 0) {
    // Eşleşmeyen sütunlar kaybolmaz: lead'in akışına not olarak düşer.
    const body = extras.map(([key, value]) => `${key}: ${value}`).join("\n");
    await sql`
      insert into notes (workspace_id, lead_id, body, params) values (${wsId}, ${lead.id}, ${body}, ${sql.json({ author: target.name })})`;
  }
  return lead.id;
}

/* ---------- dosyadan içe aktarma ---------- */

export type ImportInput = {
  stageId: Id;
  responsibleUserId: Id | null;
  tagId?: Id | null;
  /** Dosyanın adı: adsız lead'lerde ve notlarda kaynak olarak görünür. */
  source: string;
  /** Sütun başına hedef: skip, note, name, contact, company, phone, email, price ya da "field:<özel alan kimliği>". */
  columns: Array<{ header: string; target: string }>;
  rows: string[][];
};

const SLOTS: Slot[] = LEAD_SLOTS;

/**
 * Dosyadan okunan satırlardan lead oluşturur. Yalnız yönetici: toplu kayıt girişi kişi ve şirket de oluşturur ve
 * kayıtlı kişileri bütün çalışma alanında arar. Her satır bir lead'dir; eşlenen hücrelerinin hepsi boş olan satır atlanır.
 * Biçimi bozuk değer (telefon, tutar, özel alan) satırı düşürmez, nota yazılır. Hedef aşamanın "lead oluşturuldu"
 * tetikleyicileri her lead için çalışır.
 */
export function importLeads(ws: string, input: ImportInput): Promise<{ created: number; skipped: number }> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const { sql } = ctx;
    const stage = await checkTarget(ctx, input.stageId, input.tagId);
    const responsibleUserId = await checkUser(ctx, input.responsibleUserId);
    const fields = await leadFields(sql, ctx.ws.id);

    // Eşleme önce bütünüyle doğrulanır: geçersiz bir hedef varsa hiçbir satır aktarılmaz.
    const seen = new Set<string>();
    const plan = input.columns.map((column) => {
      const { target } = column;
      if (target === "skip" || target === "note") return { ...column, slot: null, field: null };
      if (seen.has(target)) throw new DataError(422, "validation", `two columns map to ${target}`);
      seen.add(target);
      if ((SLOTS as string[]).includes(target)) return { ...column, slot: target as Slot, field: null };
      const field = target.startsWith("field:") ? fields.find((item) => item.id === target.slice(6)) : undefined;
      if (!field) throw new DataError(422, "validation", `unknown target ${target}`);
      return { ...column, slot: null, field };
    });
    if (!plan.some((column) => column.target !== "skip")) throw new DataError(422, "validation", "no column is mapped");

    const source = input.source.trim().slice(0, 120) || "CSV";
    const target: LeadTarget = {
      workspaceId: ctx.ws.id,
      name: source,
      pipelineId: stage.pipelineId,
      stageId: stage.id,
      tagId: input.tagId ?? null,
      stageKind: stage.kind,
      currency: ctx.ws.currency,
      responsibleUserId,
      actorUserId: ctx.user.id,
    };

    // Olay günlüğü ve tetikleyiciler sunucu rolü ister; yetki (yönetici) ve hedefler yukarıda denetlendi.
    return ctx.system(async () => {
      let created = 0;
      let skipped = 0;
      for (const row of input.rows) {
        const parts: LeadParts = { known: {}, custom: {}, extras: [] };
        plan.forEach((column, index) => {
          const text = toText(row[index]);
          if (text === null || column.target === "skip") return;
          if (column.slot) parts.known[column.slot] = text;
          else if (column.field) {
            const value = toCustom(column.field, text);
            if (value !== undefined) parts.custom[column.field.id] = value;
            else parts.extras.push([column.field.name, text]);
          } else parts.extras.push([column.header.slice(0, 120) || `Sütun ${index + 1}`, text]);
        });
        if (Object.keys(parts.known).length + Object.keys(parts.custom).length + parts.extras.length === 0) {
          skipped += 1;
          continue;
        }
        // Lead adı sütunu yoksa ya da hücre boşsa lead, kişinin ya da şirketin adını alır.
        parts.known.name ??= parts.known.contact ?? parts.known.company;
        const leadId = await createFromParts(sql, target, parts);
        await fireAutomations(sql, ctx.ws.id, { type: "lead_created", leadId, stageId: stage.id });
        created += 1;
      }
      return { created, skipped };
    });
  });
}

/** Reddedilen gönderimin nedenini kapıya yazar; yönetici ekranda görür. Ayrı işlemdir: asıl işlem geri alınmıştır. */
export async function noteIntakeError(token: string, message: string): Promise<void> {
  await asService((sql) => sql`update lead_intakes set last_error = ${message.slice(0, 300)} where token_hash = ${hashToken(token)}`);
}
