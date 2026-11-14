// Ekranın, yapılamayacak işlemi göstermemek için kullandığı yetki denetimi.
// Kuralı sunucu uygular (src/server/pg/rights.ts); buradaki mantık onunla aynıdır ve yalnız görünümü etkiler.
import type { AccessLevel, Id, Rights, Session } from "./types";

type Entity = "leads" | "contacts" | "companies" | "tasks";

export function can(session: Session | undefined, entity: Entity, action: "edit" | "delete", responsibleUserId: Id | null): boolean {
  if (!session) return false;
  if (session.user.isAdmin) return true;
  const scope: AccessLevel = session.rights[entity][action];
  if (scope === "all") return true;
  if (scope === "none") return false;
  if (responsibleUserId === null || responsibleUserId === session.user.id) return true;
  if (scope === "group" && session.user.groupId) {
    return session.users.find((user) => user.id === responsibleUserId)?.groupId === session.user.groupId;
  }
  return false;
}

/** Dışa aktarma yetkisi "yok" değilse düğme gösterilir; hangi kayıtların çıkacağına sunucu karar verir. */
export function canExport(session: Session | undefined, entity: "leads" | "contacts" | "companies"): boolean {
  if (!session) return false;
  return session.user.isAdmin || session.rights[entity].export !== "none";
}

export function canAdd(session: Session | undefined, entity: "leads" | "contacts" | "companies"): boolean {
  if (!session) return false;
  return session.user.isAdmin || session.rights[entity].add;
}

/* ---------- yetki matrisi: hazır ayarlar ---------- */

const record = (view: AccessLevel, edit: AccessLevel, add: boolean, remove: AccessLevel, exported: AccessLevel = "none") => ({ view, edit, add, delete: remove, export: exported });

export const RIGHTS_PRESETS: Record<"full" | "own" | "read", Rights> = {
  full: {
    leads: record("all", "all", true, "all", "all"),
    contacts: record("all", "all", true, "all", "all"),
    companies: record("all", "all", true, "all", "all"),
    tasks: { view: "all", edit: "all", delete: "all" },
    inbox: { view: "all" },
  },
  own: {
    leads: record("own", "own", true, "none"),
    contacts: record("own", "own", true, "none"),
    companies: record("own", "own", true, "none"),
    tasks: { view: "own", edit: "own", delete: "none" },
    inbox: { view: "own" },
  },
  read: {
    leads: record("all", "none", false, "none"),
    contacts: record("all", "none", false, "none"),
    companies: record("all", "none", false, "none"),
    tasks: { view: "all", edit: "none", delete: "none" },
    inbox: { view: "all" },
  },
};
