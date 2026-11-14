// Birden çok rotanın paylaştığı girdi şemaları.
import { z } from "zod";

const id = z.string().min(1).max(64);

const action = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("change_responsible"),
    settings: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("user"), userId: id }),
      z.object({ mode: z.literal("round_robin"), userIds: z.array(id).min(1).max(50) }),
    ]),
  }),
  z.object({
    kind: z.literal("add_task"),
    settings: z.object({
      typeId: id,
      text: z.string().trim().max(2000).default(""),
      // En çok bir yıl sonrası.
      dueInMinutes: z.number().int().min(0).max(525_600),
      responsible: id,
    }),
  }),
  z.object({ kind: z.literal("change_stage"), settings: z.object({ stageId: id }) }),
  z.object({
    kind: z.literal("edit_tags"),
    settings: z.object({ add: z.array(id).max(20).default([]), remove: z.array(id).max(20).default([]) }),
  }),
]);

const trigger = z.object({ stageId: id, onEvent: z.enum(["lead_created", "stage_entered"]), isActive: z.boolean().optional() });

/** Yeni tetikleyici: olay + eylem. */
export const automationSchema = z.intersection(trigger, action);

/** Güncelleme: yalnız aç/kapat, ya da olay ve eylemin tamamı. */
export const automationPatchSchema = z.union([automationSchema, z.object({ isActive: z.boolean() }).strict()]);

const accessLevel = z.enum(["none", "own", "group", "all"]);
const recordRights = z.object({ view: accessLevel, edit: accessLevel, add: z.boolean(), delete: accessLevel, export: accessLevel });

/** Yetki matrisinin tamamı. Kısmi matris kabul edilmez: eksik bir hücre sessizce "yok" olmasın. */
export const rightsSchema = z.object({
  leads: recordRights,
  contacts: recordRights,
  companies: recordRights,
  tasks: z.object({ view: accessLevel, edit: accessLevel, delete: accessLevel }),
  inbox: z.object({ view: accessLevel }),
});

export const memberPatchSchema = z.object({
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  groupId: id.nullable().optional(),
  rights: rightsSchema.optional(),
});

export const groupSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const workspacePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export const profilePatchSchema = z.object({ name: z.string().trim().min(1).max(120) });

/** Ya atama ya durum: tek istekte biri. */
export const conversationPatchSchema = z.union([z.object({ assignedUserId: id.nullable() }).strict(), z.object({ status: z.enum(["open", "closed"]) }).strict()]);

export const nameSchema = (max: number) => z.object({ name: z.string().trim().min(1).max(max) });

export const savedFilterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // İçeriği ekran belirler; sunucu yalnız boyutunu sınırlar.
  criteria: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 4000, "criteria is too large"),
});

export const intakeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["generic", "google_sheets"]),
  provider: z.enum(["generic", "google_sheets", "google_forms", "zapier", "make", "n8n"]).optional(),
  stageId: id,
  tagId: id.nullable().optional(),
});

export const intakePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  stageId: id.optional(),
  tagId: id.nullable().optional(),
  isActive: z.boolean().optional(),
});

/* ---------- hesap ---------- */

const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailField,
  password: z.string().min(8).max(200),
  workspaceName: z.string().trim().min(1).max(120),
});

export const loginSchema = z.object({ email: emailField, password: z.string().min(1).max(200) });

export const forgotSchema = z.object({ email: emailField });

/* ---------- Google tabloları ---------- */

const spreadsheetId = z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);

export const sheetInspectSchema = z.object({ accountId: id, spreadsheetId });

export const sheetLinkSchema = z.object({
  accountId: id,
  spreadsheetId,
  sheetId: z.number().int().min(0),
  name: z.string().trim().min(1).max(120),
  stageId: id,
  tagId: id.nullable().optional(),
  importExisting: z.boolean().optional(),
});
