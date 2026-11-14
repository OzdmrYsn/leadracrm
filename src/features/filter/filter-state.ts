import type { Id, LeadFilter } from "@/lib/types";

export const ANY = "any";

/** Süzgeç çubuğunun ekrandaki durumu. */
export type LeadFilterState = {
  query: string;
  /** "any", "me", "none" ya da kullanıcı kimliği. */
  responsible: string;
  tagIds: Id[];
  noTask: boolean;
  unread: boolean;
  /** Yalnız liste. "any" ya da aşama kimliği. */
  stageId: string;
  /** Yalnız liste. */
  status: "open" | "won" | "lost" | "all" | "deleted";
  createdFrom: string;
  createdTo: string;
};

export const emptyFilter: LeadFilterState = {
  query: "",
  responsible: ANY,
  tagIds: [],
  noTask: false,
  unread: false,
  stageId: ANY,
  status: "open",
  createdFrom: "",
  createdTo: "",
};

/** API'ye gidecek süzgeç. query ayrı verilir, çünkü ekranda duruluncaya kadar bekletilir. */
export function toLeadFilter(state: LeadFilterState, scope: "board" | "list", query: string): LeadFilter {
  return {
    query: query.trim() || undefined,
    responsible: state.responsible === ANY ? undefined : state.responsible,
    tagIds: state.tagIds.length > 0 ? state.tagIds : undefined,
    noTask: state.noTask || undefined,
    unread: state.unread || undefined,
    stageId: scope === "list" && state.stageId !== ANY ? state.stageId : undefined,
    status: scope === "list" ? state.status : undefined,
    createdFrom: state.createdFrom || undefined,
    createdTo: state.createdTo || undefined,
  };
}

/** Açılır paneldeki etkin ölçüt sayısı (düğmede gösterilir). */
export function panelCount(state: LeadFilterState, scope: "board" | "list"): number {
  return (
    (state.responsible !== ANY && state.responsible !== "me" ? 1 : 0) +
    (state.tagIds.length > 0 ? 1 : 0) +
    (scope === "list" && state.stageId !== ANY ? 1 : 0) +
    (state.createdFrom ? 1 : 0) +
    (state.createdTo ? 1 : 0)
  );
}

/** Arama dışında herhangi bir süzgeç etkin mi? */
export function isFiltered(state: LeadFilterState, scope: "board" | "list"): boolean {
  return (
    state.query.trim() !== "" ||
    state.responsible !== ANY ||
    state.noTask ||
    state.unread ||
    panelCount(state, scope) > 0 ||
    (scope === "list" && state.status !== "open")
  );
}

const STATUSES = ["open", "won", "lost", "all", "deleted"];
const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

/** Kayıtlı bir süzgecin içeriğini güvenle ekran durumuna çevirir: tanınmayan ya da bozuk alanlar varsayılana döner. */
export function fromSaved(criteria: Record<string, unknown>): LeadFilterState {
  const status = text(criteria.status, emptyFilter.status);
  return {
    query: text(criteria.query, ""),
    responsible: text(criteria.responsible, ANY),
    tagIds: Array.isArray(criteria.tagIds) ? criteria.tagIds.filter((id): id is Id => typeof id === "string") : [],
    noTask: criteria.noTask === true,
    unread: criteria.unread === true,
    stageId: text(criteria.stageId, ANY),
    status: (STATUSES.includes(status) ? status : emptyFilter.status) as LeadFilterState["status"],
    createdFrom: text(criteria.createdFrom, ""),
    createdTo: text(criteria.createdTo, ""),
  };
}

