"use client";

// Ekranların veri kancaları. Hepsi API rotalarını çağırır; veri katmanının sahte ya da gerçek olması ekranı etkilemez.
// Yenileme şimdilik yoklamayla yapılır; arka uç adımında Supabase Realtime bunun yerini alır.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useMutation,
  useQuery as useBaseQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { StageColor } from "@/components/ui/tag";
import { api, ApiError } from "./api";
import { createSerial } from "./serial";
import type {
  Automation,
  AutomationInput,
  Board,
  BulkAction,
  BulkResult,
  Company,
  CompanyDetail,
  CompanySummary,
  Contact,
  ContactDetail,
  ContactHandle,
  ContactSummary,
  Conversation,
  CreateLeadInput,
  CreateTaskInput,
  CustomField,
  CustomFieldType,
  CustomValues,
  EntityType,
  FeedItem,
  Group,
  LossReason,
  Id,
  Insights,
  GoogleStatus,
  Intake,
  IntakeInput,
  Lead,
  LeadDetail,
  LeadFilter,
  LeadSummary,
  Member,
  Message,
  Note,
  Pipeline,
  Rights,
  SavedFilter,
  SearchResults,
  Session,
  SheetInspection,
  SheetLink,
  SheetLinkInput,
  Stage,
  StageNames,
  Tag,
  Task,
  TaskFilter,
  UpdateLeadInput,
  Workspace,
} from "./types";

const base = (ws: string) => `/api/w/${encodeURIComponent(ws)}`;

const noSubscription = () => () => undefined;

/** Sunucuda ve tarayıcının ilk (hydration) çiziminde false, sonrasında true. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * Bu dosyadaki bütün sorgular bunun üzerinden geçer. Hydration çiziminde önbellekteki veriyi döndürmez.
 *
 * Neden: kabuk (menü) sayfa içeriğinden önce etkileşimli olur ve oturumu çeker. İçerik daha geç etkileşimli
 * olduğunda (yavaş cihaz, yavaş ağ) aynı sorguyu önbellekte dolu bulur ve sunucunun çizdiğinden farklı çizer.
 * React öznitelik farklarını düzeltmez: sunucunun "disabled" yazdığı düğme kalıcı olarak devre dışı kalır.
 * İlk çizimde boş bir anahtar kullanmak, istemcinin ilk çizimini sunucununkiyle aynı tutar; veri hemen
 * ardından gelen çizimde görünür.
 */
function useQuery<TQueryFnData = unknown, TError = Error, TData = TQueryFnData>(
  options: UseQueryOptions<TQueryFnData, TError, TData, QueryKey>,
): UseQueryResult<TData, TError> {
  const hydrated = useHydrated();
  return useBaseQuery({
    ...options,
    queryKey: hydrated ? options.queryKey : ["hydrating", ...options.queryKey],
    enabled: hydrated ? options.enabled : false,
  });
}

/** Süzgeci sorgu dizgisine çevirir. Boş alanlar yazılmaz; aynı süzgeç her zaman aynı dizgiyi verir. */
export function filterQuery(filter: LeadFilter): string {
  const params = new URLSearchParams();
  if (filter.query?.trim()) params.set("q", filter.query.trim());
  if (filter.responsible) params.set("responsible", filter.responsible);
  if (filter.tagIds?.length) params.set("tags", [...filter.tagIds].sort().join(","));
  if (filter.noTask) params.set("noTask", "1");
  if (filter.unread) params.set("unread", "1");
  if (filter.stageId) params.set("stage", filter.stageId);
  if (filter.status) params.set("status", filter.status);
  if (filter.pipelineId) params.set("pipeline", filter.pipelineId);
  if (filter.createdFrom) params.set("from", filter.createdFrom);
  if (filter.createdTo) params.set("to", filter.createdTo);
  return params.toString();
}

function taskQuery(filter: TaskFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.responsible) params.set("responsible", filter.responsible);
  if (filter.status) params.set("status", filter.status);
  if (filter.leadId) params.set("lead", filter.leadId);
  if (filter.contactId) params.set("contact", filter.contactId);
  if (filter.companyId) params.set("company", filter.companyId);
  return params.toString();
}

export const keys = {
  all: (ws: string): QueryKey => ["w", ws],
  session: (ws: string): QueryKey => ["w", ws, "session"],
  board: (ws: string, pipelineId: string, filter: LeadFilter = {}): QueryKey => ["w", ws, "board", pipelineId, filterQuery(filter)],
  leads: (ws: string, filter: LeadFilter = {}): QueryKey => ["w", ws, "leads", filterQuery(filter)],
  lead: (ws: string, leadId: Id): QueryKey => ["w", ws, "lead", leadId],
  feed: (ws: string, leadId: Id): QueryKey => ["w", ws, "feed", leadId],
  tags: (ws: string): QueryKey => ["w", ws, "tags"],
  contacts: (ws: string, query: string): QueryKey => ["w", ws, "contacts", "list", query],
  contact: (ws: string, contactId: Id): QueryKey => ["w", ws, "contacts", "one", contactId],
  companies: (ws: string, query: string): QueryKey => ["w", ws, "companies", "list", query],
  company: (ws: string, companyId: Id): QueryKey => ["w", ws, "companies", "one", companyId],
  fields: (ws: string, entityType: EntityType): QueryKey => ["w", ws, "fields", entityType],
  tasks: (ws: string, filter: TaskFilter): QueryKey => ["w", ws, "tasks", taskQuery(filter)],
  conversations: (ws: string, status: string, query: string): QueryKey => ["w", ws, "conversations", status, query],
  messages: (ws: string, conversationId: Id): QueryKey => ["w", ws, "messages", conversationId],
  automations: (ws: string, pipelineId: string): QueryKey => ["w", ws, "automations", pipelineId],
  intakes: (ws: string): QueryKey => ["w", ws, "intakes"],
  members: (ws: string): QueryKey => ["w", ws, "members"],
  groups: (ws: string): QueryKey => ["w", ws, "groups"],
  search: (ws: string, query: string): QueryKey => ["w", ws, "search", query],
};

/** Göreli süreler için "şimdi". Belirli aralıklarla yenilenir. */
/**
 * Yukarı/aşağı taşımayı ekranda hemen uygular, kaydı arkadan gönderir.
 * Kayıt sürerken yapılan ikinci taşıma yok sayılmaz: ekrandaki sıradan hesaplanır. Kayıtlar sırayla gider
 * (aynı anda iki istek sunucuda yarışmaz); sonuncusu bitince sunucunun sırası gösterilir. Hata onError'a gider.
 */
export function useOptimisticOrder<T extends { id: Id }>(items: T[], save: (ids: Id[]) => Promise<unknown>) {
  const [order, setOrder] = useState<Id[] | null>(null);
  const queue = useRef<ReturnType<typeof createSerial> | null>(null);
  const shown = order
    ? [
        ...order.map((id) => items.find((item) => item.id === id)).filter((item): item is T => item !== undefined),
        // Bu arada eklenen kayıtlar sona gelir.
        ...items.filter((item) => !order.includes(item.id)),
      ]
    : items;

  function move(index: number, delta: -1 | 1, onError: (error: unknown) => void) {
    const ids = shown.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrder(ids);
    queue.current ??= createSerial();
    queue.current.run(
      () => save(ids).catch(onError),
      () => setOrder(null),
    );
  }

  return { shown, move };
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Değer durulduktan sonra günceller; her tuş vuruşunda istek atmamak için. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}

/* ---------- okuma ---------- */

export function useSession(ws: string) {
  return useQuery({ queryKey: keys.session(ws), queryFn: () => api.get<Session>(`${base(ws)}/session`), staleTime: 60_000 });
}

export function useBoard(ws: string, pipelineId = "main", filter: LeadFilter = {}) {
  const query = filterQuery(filter);
  return useQuery({
    queryKey: keys.board(ws, pipelineId, filter),
    queryFn: () => api.get<Board>(`${base(ws)}/pipelines/${pipelineId}/board${query ? `?${query}` : ""}`),
    refetchInterval: 4000,
    placeholderData: (previous) => previous,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
}

export function useLeads(ws: string, filter: LeadFilter = {}) {
  const query = filterQuery(filter);
  return useQuery({
    queryKey: keys.leads(ws, filter),
    queryFn: () => api.get<LeadSummary[]>(`${base(ws)}/leads${query ? `?${query}` : ""}`),
    placeholderData: (previous) => previous,
  });
}

/** Kayıt silinmişse (404) yeniden sormanın anlamı yok; yoklama durur. */
const pollUnlessGone = (intervalMs: number) => (query: { state: { error: unknown } }) =>
  query.state.error instanceof ApiError && query.state.error.status === 404 ? false : intervalMs;

export function useLead(ws: string, leadId: Id) {
  return useQuery({
    queryKey: keys.lead(ws, leadId),
    queryFn: () => api.get<LeadDetail>(`${base(ws)}/leads/${leadId}`),
    refetchInterval: pollUnlessGone(5000),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
}

export function useLeadFeed(ws: string, leadId: Id) {
  return useQuery({
    queryKey: keys.feed(ws, leadId),
    queryFn: () => api.get<FeedItem[]>(`${base(ws)}/leads/${leadId}/feed`),
    refetchInterval: pollUnlessGone(2500),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
}

export function useTags(ws: string) {
  return useQuery({ queryKey: keys.tags(ws), queryFn: () => api.get<Tag[]>(`${base(ws)}/tags`), staleTime: 30_000 });
}

const notFoundAware = (count: number, error: unknown) => !(error instanceof ApiError && error.status === 404) && count < 1;

export function useContacts(ws: string, query: string, enabled = true) {
  return useQuery({
    queryKey: keys.contacts(ws, query),
    queryFn: () => api.get<ContactSummary[]>(`${base(ws)}/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useContact(ws: string, contactId: Id) {
  return useQuery({
    queryKey: keys.contact(ws, contactId),
    queryFn: () => api.get<ContactDetail>(`${base(ws)}/contacts/${contactId}`),
    retry: notFoundAware,
  });
}

export function useCompanies(ws: string, query: string, enabled = true) {
  return useQuery({
    queryKey: keys.companies(ws, query),
    queryFn: () => api.get<CompanySummary[]>(`${base(ws)}/companies${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useCompany(ws: string, companyId: Id) {
  return useQuery({
    queryKey: keys.company(ws, companyId),
    queryFn: () => api.get<CompanyDetail>(`${base(ws)}/companies/${companyId}`),
    retry: notFoundAware,
  });
}

export function useFields(ws: string, entityType: EntityType) {
  return useQuery({
    queryKey: keys.fields(ws, entityType),
    queryFn: () => api.get<CustomField[]>(`${base(ws)}/fields?entity=${entityType}`),
    staleTime: 30_000,
  });
}

export function useTasks(ws: string, filter: TaskFilter, enabled = true) {
  const query = taskQuery(filter);
  return useQuery({
    queryKey: keys.tasks(ws, filter),
    queryFn: () => api.get<Task[]>(`${base(ws)}/tasks${query ? `?${query}` : ""}`),
    enabled,
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useConversations(ws: string, status: "open" | "all" = "open", query = "") {
  return useQuery({
    queryKey: keys.conversations(ws, status, query),
    queryFn: () => {
      const params = new URLSearchParams({ status });
      if (query) params.set("q", query);
      return api.get<Conversation[]>(`${base(ws)}/conversations?${params}`);
    },
    refetchInterval: 4000,
    placeholderData: (previous) => previous,
  });
}

export function useMessages(ws: string, conversationId: Id | null) {
  return useQuery({
    queryKey: keys.messages(ws, conversationId ?? "none"),
    queryFn: () => api.get<Message[]>(`${base(ws)}/conversations/${conversationId}/messages`),
    enabled: conversationId !== null,
    refetchInterval: 2500,
  });
}

/* ---------- lead ---------- */

export function useCreateLead(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) => api.post<Lead>(`${base(ws)}/leads`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useUpdateLead(ws: string, leadId: Id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLeadInput) => api.patch<Lead>(`${base(ws)}/leads/${leadId}`, input),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useDeleteLead(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (leadId: Id) => api.delete(`${base(ws)}/leads/${leadId}`),
    // Silinen lead'in kendi sorguları yenilenmez (artık 404 döner); diğer her şey yenilenir.
    onSuccess: (_result, leadId) =>
      client.invalidateQueries({ queryKey: keys.all(ws), predicate: (query) => query.queryKey[3] !== leadId }),
  });
}

export function useSetLeadTags(ws: string, leadId: Id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tagIds: Id[]) => api.put<Tag[]>(`${base(ws)}/leads/${leadId}/tags`, { tagIds }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

type MoveInput = { leadId: Id; stageId: Id; expectedStageId: Id };

/** Kartı panoda taşır. Önce ekranda taşır, sunucu reddederse geri alır. boardKey, ekrandaki panonun anahtarıdır. */
export function useMoveLead(ws: string, boardKey: QueryKey) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, stageId, expectedStageId }: MoveInput) =>
      api.patch<Lead>(`${base(ws)}/leads/${leadId}`, { stageId, expectedStageId }),
    onMutate: async ({ leadId, stageId }) => {
      await client.cancelQueries({ queryKey: boardKey });
      const previous = client.getQueryData<Board>(boardKey);
      if (previous) {
        const moving = previous.columns.flatMap((column) => column.leads).find((lead) => lead.id === leadId);
        if (moving) {
          client.setQueryData<Board>(boardKey, {
            ...previous,
            columns: previous.columns.map((column) => {
              const without = column.leads.filter((lead) => lead.id !== leadId);
              const leads = column.stage.id === stageId ? [{ ...moving, stageId }, ...without] : without;
              return {
                ...column,
                leads,
                count: leads.length,
                totalMinor: leads.reduce((sum, lead) => sum + lead.priceMinor, 0),
              };
            }),
          });
        }
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(boardKey, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useAcceptLead(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (leadId: Id) => api.post<Lead>(`${base(ws)}/leads/${leadId}/accept`),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useDeclineLead(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (leadId: Id) => api.post<void>(`${base(ws)}/leads/${leadId}/decline`),
    // Reddedilen lead silinir; kendi sorguları yenilenmez (404 döner), diğer her şey yenilenir.
    onSuccess: (_result, leadId) =>
      client.invalidateQueries({ queryKey: keys.all(ws), predicate: (query) => query.queryKey[3] !== leadId }),
    onError: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useRestoreLead(ws: string) {
  return useAdminMutation(ws, (leadId: Id) => api.post<Lead>(`${base(ws)}/leads/${leadId}/restore`));
}

/** Kaybedilen lead'in nedenini yazar (panoda kapatırken sorulur). */
export function useSetLossReason(ws: string) {
  return useAdminMutation(ws, ({ leadId, lossReasonId }: { leadId: Id; lossReasonId: Id | null }) => api.patch<Lead>(`${base(ws)}/leads/${leadId}`, { lossReasonId }));
}

export function useUpdateTag(ws: string) {
  return useAdminMutation(ws, ({ id, color }: { id: Id; color: StageColor | null }) => api.patch<Tag>(`${base(ws)}/tags/${id}`, { color }));
}

export function useDeleteTag(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.delete(`${base(ws)}/tags/${id}`));
}

export function useCreateLossReason(ws: string) {
  return useAdminMutation(ws, (name: string) => api.post<LossReason>(`${base(ws)}/loss-reasons`, { name }));
}

export function useUpdateLossReason(ws: string) {
  return useAdminMutation(ws, ({ id, name }: { id: Id; name: string }) => api.patch<LossReason>(`${base(ws)}/loss-reasons/${id}`, { name }));
}

export function useDeleteLossReason(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.delete(`${base(ws)}/loss-reasons/${id}`));
}

export function useSavedFilters(ws: string) {
  return useQuery({ queryKey: ["w", ws, "savedFilters"], queryFn: () => api.get<SavedFilter[]>(`${base(ws)}/saved-filters`), staleTime: 30_000 });
}

export function useCreateSavedFilter(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; criteria: Record<string, unknown> }) => api.post<SavedFilter>(`${base(ws)}/saved-filters`, input),
    onSettled: () => client.invalidateQueries({ queryKey: ["w", ws, "savedFilters"] }),
  });
}

export function useDeleteSavedFilter(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => api.delete(`${base(ws)}/saved-filters/${id}`),
    onSettled: () => client.invalidateQueries({ queryKey: ["w", ws, "savedFilters"] }),
  });
}

/** İçe aktarmanın bir parçasını gönderir. Sorgular pencere işi bitirince yenilenir (her parçada değil). */
export function useImportLeads(ws: string) {
  return useMutation({
    mutationFn: (input: { stageId: Id; responsibleUserId: Id | null; tagId: Id | null; source: string; columns: Array<{ header: string; target: string }>; rows: string[][] }) =>
      api.post<{ created: number; skipped: number }>(`${base(ws)}/leads/import`, input),
  });
}

/** Seçili lead'lere toplu işlem uygular. */
export function useBulkLeads(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: Id[]; action: BulkAction }) => api.post<BulkResult>(`${base(ws)}/leads/bulk`, input),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

/** Gelen talebi mevcut bir lead'e bağlar. Talep için açılan lead silinir; onun sorguları yenilenmez. */
export function useLinkLead(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, targetLeadId }: { leadId: Id; targetLeadId: Id }) => api.post<Lead>(`${base(ws)}/leads/${leadId}/link`, { targetLeadId }),
    onSuccess: (_result, { leadId }) => client.invalidateQueries({ queryKey: keys.all(ws), predicate: (query) => query.queryKey[3] !== leadId }),
    onError: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

/* ---------- etiketler ve kişiler ---------- */

export function useCreateTag(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: StageColor }) => api.post<Tag>(`${base(ws)}/tags`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.tags(ws) }),
  });
}

export function useCreateContact(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; companyId?: Id | null; phone?: string; email?: string }) =>
      api.post<Contact>(`${base(ws)}/contacts`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useUpdateContact(ws: string, contactId: Id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; companyId?: Id | null; responsibleUserId?: Id | null; handles?: ContactHandle[]; custom?: CustomValues }) =>
      api.patch<Contact>(`${base(ws)}/contacts/${contactId}`, input),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useCreateCompany(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.post<Company>(`${base(ws)}/companies`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useUpdateCompany(ws: string, companyId: Id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; responsibleUserId?: Id | null; custom?: CustomValues }) =>
      api.patch<Company>(`${base(ws)}/companies/${companyId}`, input),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

/* ---------- özel alanlar ---------- */

export function useCreateField(ws: string) {
  return useAdminMutation(ws, (input: { entityType: EntityType; name: string; type: CustomFieldType; options?: string[] }) =>
    api.post<CustomField>(`${base(ws)}/fields`, input),
  );
}

export function useUpdateField(ws: string) {
  return useAdminMutation(ws, ({ fieldId, ...input }: { fieldId: Id; name?: string; options?: string[] }) =>
    api.patch<CustomField>(`${base(ws)}/fields/${fieldId}`, input),
  );
}

export function useReorderFields(ws: string, entityType: EntityType) {
  return useAdminMutation(ws, (fieldIds: Id[]) => api.put<CustomField[]>(`${base(ws)}/fields/order`, { entityType, fieldIds }));
}

export function useDeleteField(ws: string) {
  return useAdminMutation(ws, (fieldId: Id) => api.delete(`${base(ws)}/fields/${fieldId}`));
}

/* ---------- görevler ---------- */

export function useCreateTask(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.post<Task>(`${base(ws)}/tasks`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useCompleteTask(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, resultText }: { taskId: Id; resultText?: string }) =>
      api.post<Task>(`${base(ws)}/tasks/${taskId}/complete`, { resultText }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

/* ---------- pipeline ve aşamalar ---------- */

function useAdminMutation<TInput, TResult>(ws: string, mutationFn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }) });
}

/* ---------- otomasyonlar ve lead kaynakları ---------- */

export function useAutomations(ws: string, pipelineId: Id | undefined) {
  return useQuery({
    queryKey: keys.automations(ws, pipelineId ?? "main"),
    queryFn: () => api.get<Automation[]>(`${base(ws)}/automations${pipelineId ? `?pipeline=${encodeURIComponent(pipelineId)}` : ""}`),
  });
}

export function useCreateAutomation(ws: string) {
  return useAdminMutation(ws, (input: AutomationInput) => api.post<Automation>(`${base(ws)}/automations`, input));
}

/** Yalnız aç/kapat için { id, isActive }; ayarlar değişiyorsa olay ve eylemin tamamı gönderilir. */
export function useUpdateAutomation(ws: string) {
  return useAdminMutation(ws, ({ id, ...input }: { id: Id } & (AutomationInput | { isActive: boolean })) =>
    api.patch<Automation>(`${base(ws)}/automations/${id}`, input),
  );
}

export function useDeleteAutomation(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.delete(`${base(ws)}/automations/${id}`));
}

export function useIntakes(ws: string) {
  return useQuery({ queryKey: keys.intakes(ws), queryFn: () => api.get<Intake[]>(`${base(ws)}/intakes`), refetchInterval: 15_000 });
}

/** Yanıttaki token gizli adresin anahtarıdır ve yalnız bir kez döner. */
export function useCreateIntake(ws: string) {
  return useAdminMutation(ws, (input: IntakeInput) => api.post<{ intake: Intake; token: string }>(`${base(ws)}/intakes`, input));
}

export function useUpdateIntake(ws: string) {
  return useAdminMutation(ws, ({ id, ...input }: { id: Id; name?: string; stageId?: Id; tagId?: Id | null; isActive?: boolean }) =>
    api.patch<Intake>(`${base(ws)}/intakes/${id}`, input),
  );
}

export function useRotateIntake(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.post<{ intake: Intake; token: string }>(`${base(ws)}/intakes/${id}/rotate`));
}

export function useDeleteIntake(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.delete(`${base(ws)}/intakes/${id}`));
}

/* ---------- Google hesabıyla bağlanan tablolar ---------- */

export function useGoogle(ws: string) {
  return useQuery({ queryKey: [...keys.intakes(ws), "google"], queryFn: () => api.get<GoogleStatus>(`${base(ws)}/google/accounts`) });
}

export function useSheetLinks(ws: string) {
  return useQuery({ queryKey: [...keys.intakes(ws), "links"], queryFn: () => api.get<SheetLink[]>(`${base(ws)}/sheet-links`), refetchInterval: 15_000 });
}

/** Geliştirme kipinde örnek Google hesabındaki tablolar. Gerçek kipte Google'ın dosya seçicisi kullanılır. */
export function useDevGoogleFiles(ws: string, accountId: Id | null, enabled: boolean) {
  return useQuery({
    queryKey: [...keys.intakes(ws), "google-files", accountId],
    queryFn: () => api.get<Array<{ id: string; name: string }>>(`${base(ws)}/google/accounts/${accountId}/files`),
    enabled: enabled && accountId !== null,
  });
}

export function useInspectSheet(ws: string) {
  return useMutation({ mutationFn: (input: { accountId: Id; spreadsheetId: string }) => api.post<SheetInspection>(`${base(ws)}/google/inspect`, input) });
}

export function useCreateSheetLink(ws: string) {
  return useAdminMutation(ws, (input: SheetLinkInput) => api.post<{ intake: Intake; imported: number }>(`${base(ws)}/sheet-links`, input));
}

export function useSyncSheetLink(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.post<{ created: number; error: string | null }>(`${base(ws)}/sheet-links/${id}/sync`));
}

export function useCreatePipeline(ws: string) {
  return useAdminMutation(ws, (input: { name: string; stageNames: StageNames }) => api.post<Pipeline>(`${base(ws)}/pipelines`, input));
}

export function useUpdatePipeline(ws: string, pipelineId: Id) {
  return useAdminMutation(ws, (input: { name?: string; incomingEnabled?: boolean }) =>
    api.patch<Pipeline>(`${base(ws)}/pipelines/${pipelineId}`, input),
  );
}

export function useCreateStage(ws: string, pipelineId: Id) {
  return useAdminMutation(ws, (input: { name: string; color: StageColor }) =>
    api.post<Stage>(`${base(ws)}/pipelines/${pipelineId}/stages`, input),
  );
}

export function useUpdateStage(ws: string) {
  return useAdminMutation(ws, ({ stageId, ...input }: { stageId: Id; name?: string; color?: StageColor }) =>
    api.patch<Stage>(`${base(ws)}/stages/${stageId}`, input),
  );
}

export function useReorderStages(ws: string, pipelineId: Id) {
  return useAdminMutation(ws, (stageIds: Id[]) => api.put<Pipeline>(`${base(ws)}/pipelines/${pipelineId}/stages/order`, { stageIds }));
}

export function useDeleteStage(ws: string) {
  return useAdminMutation(ws, ({ stageId, moveTo }: { stageId: Id; moveTo?: Id }) =>
    api.delete(`${base(ws)}/stages/${stageId}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ""}`),
  );
}

/* ---------- raporlar ---------- */

/** Dönem ya da sorumlu değişirken önceki rapor ekranda kalır; yenisi gelince yerini alır. */
export function useInsights(ws: string, days: number, responsible: string) {
  return useQuery({
    queryKey: ["w", ws, "insights", days, responsible],
    queryFn: () => api.get<Insights>(`${base(ws)}/insights?days=${days}${responsible ? `&responsible=${encodeURIComponent(responsible)}` : ""}`),
    placeholderData: (previous) => previous,
  });
}

/* ---------- ekip, çalışma alanı, profil ---------- */

export function useMembers(ws: string) {
  return useQuery({ queryKey: keys.members(ws), queryFn: () => api.get<Member[]>(`${base(ws)}/members`) });
}

export function useUpdateMember(ws: string) {
  return useAdminMutation(ws, ({ id, ...input }: { id: Id; isAdmin?: boolean; isActive?: boolean; groupId?: Id | null; rights?: Rights }) =>
    api.patch<Member>(`${base(ws)}/members/${id}`, input),
  );
}

export function useGroups(ws: string) {
  return useQuery({ queryKey: keys.groups(ws), queryFn: () => api.get<Group[]>(`${base(ws)}/groups`) });
}

export function useCreateGroup(ws: string) {
  return useAdminMutation(ws, (name: string) => api.post<Group>(`${base(ws)}/groups`, { name }));
}

export function useUpdateGroup(ws: string) {
  return useAdminMutation(ws, ({ id, name }: { id: Id; name: string }) => api.patch<Group>(`${base(ws)}/groups/${id}`, { name }));
}

export function useDeleteGroup(ws: string) {
  return useAdminMutation(ws, (id: Id) => api.delete(`${base(ws)}/groups/${id}`));
}

export function useUpdateWorkspace(ws: string) {
  return useAdminMutation(ws, (input: { name?: string; currency?: string; timezone?: string }) => api.patch<Workspace>(`${base(ws)}/workspace`, input));
}

export function useUpdateProfile(ws: string) {
  return useAdminMutation(ws, (input: { name: string }) => api.patch<{ id: Id; name: string; email: string }>(`${base(ws)}/profile`, input));
}

/** Genel arama. İki karakterden kısa sorguda istek atılmaz. */
export function useSearch(ws: string, query: string) {
  const text = query.trim();
  return useQuery({
    queryKey: keys.search(ws, text),
    queryFn: () => api.get<SearchResults>(`${base(ws)}/search?q=${encodeURIComponent(text)}`),
    enabled: text.length >= 2,
    placeholderData: (previous) => previous,
  });
}

/* ---------- konuşmalar ---------- */

export function useSetConversationStatus(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, status }: { conversationId: Id; status: "open" | "closed" }) =>
      api.patch<Conversation>(`${base(ws)}/conversations/${conversationId}`, { status }),
    onSettled: () => client.invalidateQueries({ queryKey: ["w", ws, "conversations"] }),
  });
}

export function useAssignConversation(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, userId }: { conversationId: Id; userId: Id | null }) =>
      api.patch<Conversation>(`${base(ws)}/conversations/${conversationId}`, { assignedUserId: userId }),
    onSettled: () => client.invalidateQueries({ queryKey: ["w", ws, "conversations"] }),
  });
}

export function useMarkRead(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: Id) => api.post<void>(`${base(ws)}/conversations/${conversationId}/read`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["w", ws, "conversations"] }),
  });
}

/**
 * Mesaj gönderir. Mesaj hemen "gönderiliyor" durumunda görünür; client_token sayesinde
 * yeniden deneme ya da çift tıklama ikinci bir mesaj üretmez.
 */
export function useSendMessage(ws: string, conversationId: Id | null, senderName: string, leadId?: Id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, clientToken }: { body: string; clientToken: string }) =>
      api.post<Message>(`${base(ws)}/conversations/${conversationId}/messages`, { body, clientToken }),
    onMutate: async ({ body, clientToken }) => {
      if (!conversationId) return;
      const optimistic: Message = {
        id: `pending-${clientToken}`,
        conversationId,
        direction: "out",
        senderKind: "user",
        senderName,
        body,
        status: "queued",
        clientToken,
        createdAt: new Date().toISOString(),
      };
      const messagesKey = keys.messages(ws, conversationId);
      await client.cancelQueries({ queryKey: messagesKey });
      client.setQueryData<Message[]>(messagesKey, (current) => [...(current ?? []), optimistic]);
      if (leadId) {
        const feedKey = keys.feed(ws, leadId);
        await client.cancelQueries({ queryKey: feedKey });
        client.setQueryData<FeedItem[]>(feedKey, (current) => [
          ...(current ?? []),
          { kind: "message", at: optimistic.createdAt, message: optimistic },
        ]);
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}

export function useAddNote(ws: string, leadId: Id) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<Note>(`${base(ws)}/notes`, { leadId, body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.feed(ws, leadId) }),
  });
}

/** Yalnız geliştirme: bir kanaldan mesaj gelmiş gibi yapar. */
export function useSimulateInbound(ws: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { externalChatId?: string; text?: string } = {}) =>
      api.post<{ conversationId: Id; leadId: Id; created: boolean }>("/api/dev/simulate-inbound", { ws, ...input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all(ws) }),
  });
}
