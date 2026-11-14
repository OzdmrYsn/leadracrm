// Yetki matrisi: görme kapsamını veritabanı (RLS) uygular; düzenleme, ekleme, silme ve dışa aktarmayı buradaki
// işlevler denetler. Kaynak tektir: üyenin "rights" verisi. Yönetici her şeyi yapar.
import type { AccessLevel, Id, Rights } from "@/lib/types";
import { DataError } from "../errors";
import type { Ctx } from "./ctx";

const LEVELS: AccessLevel[] = ["none", "own", "group", "all"];
const level = (value: unknown): AccessLevel => (LEVELS.includes(value as AccessLevel) ? (value as AccessLevel) : "none");
const record = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

/** Veritabanındaki serbest biçimli yetki verisini tam bir matrise çevirir. Eksik ya da tanınmayan değer "yok" sayılır. */
export function normalizeRights(raw: unknown): Rights {
  const all = record(raw);
  const entity = (key: string) => {
    const item = record(all[key]);
    return { view: level(item.view), edit: level(item.edit), add: item.add === true, delete: level(item.delete), export: level(item.export) };
  };
  const tasks = record(all.tasks);
  return {
    leads: entity("leads"),
    contacts: entity("contacts"),
    companies: entity("companies"),
    tasks: { view: level(tasks.view), edit: level(tasks.edit), delete: level(tasks.delete) },
    inbox: { view: level(record(all.inbox).view) },
  };
}

const FULL_RECORD = { view: "all", edit: "all", add: true, delete: "all", export: "all" } as const;

/** Yöneticinin yetkileri: her şey. */
export const FULL_RIGHTS: Rights = {
  leads: FULL_RECORD,
  contacts: FULL_RECORD,
  companies: FULL_RECORD,
  tasks: { view: "all", edit: "all", delete: "all" },
  inbox: { view: "all" },
};

type Entity = "leads" | "contacts" | "companies" | "tasks";

const denied = (detail: string) => new DataError(403, "no_permission", detail);

/**
 * Kullanıcı bu kaydı düzenleyebilir / silebilir / dışa aktarabilir mi? Kural, görme kapsamıyla aynıdır:
 * sahipsiz kayıt ortak havuzdur; "own" yalnız kendi kaydını, "group" grubundaki sorumluların kaydını kapsar.
 */
export async function requireCan(ctx: Ctx, entity: Entity, action: "edit" | "delete" | "export", responsibleUserId: Id | null): Promise<void> {
  if (ctx.user.isAdmin) return;
  const rights = ctx.rights[entity] as Record<string, unknown>;
  const scope = level(rights[action]);
  if (scope === "all") return;
  if (scope === "none") throw denied(`${entity}.${action} is not allowed`);
  if (responsibleUserId === null || responsibleUserId === ctx.user.id) return;
  if (scope === "group" && ctx.groupId) {
    const [same] = await ctx.sql`
      select 1 from workspace_members where workspace_id = ${ctx.ws.id} and user_id = ${responsibleUserId} and group_id = ${ctx.groupId}`;
    if (same) return;
  }
  throw denied(`${entity}.${action} is limited to ${scope}`);
}

/**
 * Dışa aktarma kapsamı: kullanıcının hangi sorumlunun kayıtlarını dışa aktarabileceğini söyleyen bir süzgeç döndürür.
 * Yetki "yok" ise 403. Görme kapsamını veritabanı ayrıca uygular; bu süzgeç onun üstüne gelir.
 */
export async function exportScope(ctx: Ctx, entity: "leads" | "contacts" | "companies"): Promise<(responsibleUserId: Id | null) => boolean> {
  if (ctx.user.isAdmin) return () => true;
  const scope = ctx.rights[entity].export;
  if (scope === "all") return () => true;
  if (scope === "none") throw denied(`${entity}.export is not allowed`);
  const mine = new Set<Id>([ctx.user.id]);
  if (scope === "group" && ctx.groupId) {
    const members = await ctx.sql<Array<{ userId: Id }>>`
      select user_id from workspace_members where workspace_id = ${ctx.ws.id} and group_id = ${ctx.groupId}`;
    for (const member of members) mine.add(member.userId);
  }
  return (responsibleUserId) => responsibleUserId === null || mine.has(responsibleUserId);
}

export function requireAdd(ctx: Ctx, entity: "leads" | "contacts" | "companies"): void {
  if (ctx.user.isAdmin || ctx.rights[entity].add) return;
  throw denied(`${entity}.add is not allowed`);
}
