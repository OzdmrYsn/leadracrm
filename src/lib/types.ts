// Ekranların ve API'nin paylaştığı veri biçimleri.
// Sahte veri katmanı da gerçek (Supabase) veri katmanı da bu biçimleri döndürür.
import type { Subscription } from "./billing";
import type { StageColor } from "@/components/ui/tag";

export type Id = string;
export type StageKind = "incoming" | "open" | "won" | "lost";

export type User = { id: Id; name: string; email: string; isAdmin: boolean; groupId: Id | null };

/** Saat biçimi: 24 saat ya da 12 saat (ÖÖ/ÖS). */
export type TimeFormat = "12" | "24";
/** Tarih biçimi. text: "21 Kas 2026"; dmy: "21.11.2026"; mdy: "11/21/2026"; ymd: "2026-11-21". */
export type DateFormat = "text" | "dmy" | "mdy" | "ymd";

/** locale, saat biçimini de taşır (BCP 47 "hc" uzantısı, ör. "tr-TR-u-hc-h12"); saatler ona göre yazılır. */
export type Workspace = { slug: string; name: string; currency: string; locale: string; timezone: string; timeFormat: TimeFormat; dateFormat: DateFormat };

export type TaskType = { id: Id; name: string; isSystem: boolean };

/** Bekleyen davet. expired: bağlantının süresi dolmuş (yeniden gönderilebilir). */
export type Invitation = { id: Id; email: string; name: string; isAdmin: boolean; groupId: Id | null; expiresAt: string; lastSentAt: string; expired: boolean; invitedBy: string | null };

/** Davet sayfasında gösterilen bilgi. hasAccount: bu e-postanın zaten bir hesabı var. */
export type InvitationPreview = { workspaceName: string; email: string; name: string; inviterName: string | null; hasAccount: boolean };

export type LossReason = { id: Id; name: string };

export type Session = {
  user: User;
  /** Oturumdaki kullanıcının yetkileri. Ekran bunlarla yalnız neyi göstereceğine karar verir; kuralı sunucu uygular. */
  rights: Rights;
  workspace: Workspace;
  /** Kullanıcının e-postası doğrulanmış mı. Doğrulanmamışsa uyarı çıkar ve davet gönderilemez. */
  emailVerified: boolean;
  /** Abonelik durumu: deneme ve salt okunur uyarıları, koltuk kullanımı. */
  subscription: Subscription;
  users: User[];
  pipelines: Pipeline[];
  taskTypes: TaskType[];
  /** Lead kaybedildiğinde seçilebilecek nedenler. */
  lossReasons: LossReason[];
};

export type EntityType = "lead" | "contact" | "company";

/* ---------- özel alanlar ---------- */

export type CustomFieldType = "text" | "numeric" | "checkbox" | "select" | "multiselect" | "date" | "url";

export type CustomField = {
  id: Id;
  entityType: EntityType;
  name: string;
  type: CustomFieldType;
  /** Yalnız select ve multiselect. */
  options: Array<{ id: Id; label: string }>;
  sort: number;
};

/** text, url: metin · numeric: sayı · checkbox: boolean · select: seçenek kimliği · multiselect: kimlik dizisi · date: yyyy-aa-gg. */
export type CustomValue = string | number | boolean | string[] | null;
export type CustomValues = Record<Id, CustomValue>;

export type Stage = { id: Id; pipelineId: Id; name: string; kind: StageKind; color: StageColor; sort: number };

export type Pipeline = { id: Id; name: string; isMain: boolean; incomingEnabled: boolean; stages: Stage[] };

/** count: etiketi taşıyan (silinmemiş) lead sayısı; yalnız etiket listesinde dolu gelir. */
export type Tag = { id: Id; name: string; color?: StageColor; count?: number };

export type ContactHandle = { kind: "phone" | "email" | "telegram" | "whatsapp"; value: string };

export type UserRef = { id: Id; name: string };

export type Company = {
  id: Id;
  name: string;
  responsibleUserId: Id | null;
  custom: CustomValues;
  createdAt: string;
  updatedAt: string;
};

export type CompanySummary = {
  id: Id;
  name: string;
  responsible: UserRef | null;
  contactCount: number;
  leadCount: number;
  updatedAt: string;
};

export type Contact = {
  id: Id;
  name: string;
  companyId: Id | null;
  /** Şirketin adı; gösterim için. */
  company: string | null;
  handles: ContactHandle[];
  responsibleUserId: Id | null;
  custom: CustomValues;
  createdAt: string;
  updatedAt: string;
};

export type ContactSummary = {
  id: Id;
  name: string;
  companyId: Id | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  responsible: UserRef | null;
  leadCount: number;
  updatedAt: string;
};

export type Lead = {
  id: Id;
  name: string;
  priceMinor: number;
  currency: string;
  pipelineId: Id;
  stageId: Id;
  responsibleUserId: Id | null;
  contactId: Id | null;
  /** Lead başına tek şirket. */
  companyId: Id | null;
  conversationId: Id | null;
  tagIds: Id[];
  custom: CustomValues;
  incomingCategory: "chat" | "form" | null;
  /** Yalnız kaybedilen lead'de dolu olabilir. */
  lossReasonId: Id | null;
  closestTaskAt: string | null;
  lastMessageAt: string | null;
  stageEnteredAt: string;
  closedAt: string | null;
  /** Çöp kutusunda ise dolu. Silinen lead hiçbir listede görünmez. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Pano ve liste süzgeci. Hepsi isteğe bağlı; verilenlerin tümü birlikte uygulanır. */
export type LeadFilter = {
  query?: string;
  /** "me", "none" ya da bir kullanıcı kimliği. */
  responsible?: string;
  /** Seçili etiketlerden en az birini taşıyanlar. */
  tagIds?: Id[];
  noTask?: boolean;
  unread?: boolean;
  /** Yalnız liste: tek bir aşama. */
  stageId?: Id;
  /** Yalnız liste. Varsayılan "open": gelen talepler ve açık aşamalar. */
  /** deleted: çöp kutusundaki lead'ler. */
  status?: "open" | "won" | "lost" | "all" | "deleted";
  pipelineId?: Id;
  /** Oluşturulma tarihi, yyyy-aa-gg, çalışma alanının saat diliminde, uçlar dahil. */
  createdFrom?: string;
  createdTo?: string;
};

/** Panodaki ve listedeki satır: lead + gösterim için gereken birleştirilmiş alanlar. */
export type LeadSummary = {
  id: Id;
  name: string;
  priceMinor: number;
  currency: string;
  stageId: Id;
  contactName: string | null;
  companyName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: number;
  hasTask: boolean;
  tags: Tag[];
  responsible: { id: Id; name: string } | null;
  updatedAt: string;
};

/** Seçili lead'lere toplu uygulanan işlem. */
export type BulkAction =
  | { kind: "responsible"; userId: Id | null }
  | { kind: "stage"; stageId: Id }
  | { kind: "tags"; add: Id[]; remove: Id[] }
  | { kind: "delete" };

/** skipped: işlemin uygulanamadığı lead'ler ve nedeni (hata kodu: no_permission, invalid_stage, not_found ...). */
export type BulkResult = { done: number; skipped: Array<{ id: Id; reason: string }> };

export type BoardColumn = { stage: Stage; count: number; totalMinor: number; leads: LeadSummary[] };

export type Board = { pipeline: Pipeline; currency: string; columns: BoardColumn[] };

export type ChannelKind = "telegram" | "whatsapp" | "instagram" | "facebook" | "tiktok" | "livechat" | "sms" | "viber";

/** Bağlı bir mesajlaşma kanalı. Anahtarı istemciye hiç dönmez. */
export type Channel = {
  id: Id;
  kind: ChannelKind;
  /** Hizmetteki hesabın görünen adı, örn. "@ornek_bot". */
  name: string;
  status: "pending" | "connected" | "error" | "disconnected";
  pipelineId: Id | null;
  /** Kanal koptuysa neden (örn. "unauthorized"). */
  lastError: string | null;
  /** Kanaldan gelen son bildirimin zamanı. */
  lastEventAt: string | null;
  connectedAt: string | null;
};

export type Conversation = {
  id: Id;
  channel: { id: Id; kind: ChannelKind; name: string };
  contactId: Id;
  contactName: string;
  leadId: Id | null;
  leadIsIncoming: boolean;
  status: "open" | "closed";
  assignedUserId: Id | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
};

export type MessageStatus = "received" | "queued" | "sent" | "delivered" | "read" | "failed";

export type Message = {
  id: Id;
  conversationId: Id;
  direction: "in" | "out";
  senderKind: "contact" | "user" | "bot" | "system";
  senderName: string | null;
  body: string;
  status: MessageStatus;
  /** Gönderim başarısızsa neden (örn. "recipient_blocked"). Arayüz okunur metne çevirir. */
  errorCode: string | null;
  clientToken: string | null;
  createdAt: string;
};

export type Note = { id: Id; leadId: Id; body: string; authorName: string; createdAt: string };

export type LeadEvent = {
  id: Id;
  leadId: Id;
  type: "lead_created" | "lead_accepted" | "request_linked" | "stage_changed" | "responsible_changed" | "task_added" | "task_completed";
  actorName: string | null;
  /** Olayı kimin yaptığı: kullanıcı, sistem (gelen mesaj), bir tetikleyici ya da bir lead kaynağı. */
  actorKind: "user" | "system" | "automation" | "integration";
  /** request_linked: "to" yazan kişinin adı. stage_changed: önceki ve yeni aşama adı. responsible_changed: yeni sorumlu adı. task_*: "to" görevin metni ya da türü, "from" tamamlama sonucu. */
  from: string | null;
  to: string | null;
  createdAt: string;
};

export type FeedItem =
  | { kind: "message"; at: string; message: Message }
  | { kind: "note"; at: string; note: Note }
  | { kind: "event"; at: string; event: LeadEvent };

export type LeadDetail = {
  lead: Lead;
  stage: Stage;
  pipeline: Pipeline;
  contact: Contact | null;
  company: Company | null;
  tags: Tag[];
  responsible: User | null;
  conversation: Conversation | null;
};

export type ContactDetail = { contact: Contact; company: Company | null; responsible: User | null; leads: LeadSummary[] };

export type CompanyDetail = { company: Company; responsible: User | null; contacts: ContactSummary[]; leads: LeadSummary[] };

/* ---------- görevler ---------- */

export type Task = {
  id: Id;
  typeId: Id;
  typeName: string;
  text: string;
  dueAt: string;
  responsible: UserRef | null;
  completedAt: string | null;
  resultText: string | null;
  /** Görevin bağlı olduğu kayıt. */
  target: { kind: EntityType; id: Id; name: string };
  createdAt: string;
};

export type TaskFilter = {
  /** ISO anı; dueAt bu aralıkta olanlar (uçlar dahil). */
  from?: string;
  to?: string;
  /** "me" ya da kullanıcı kimliği. */
  responsible?: string;
  status?: "open" | "done" | "all";
  leadId?: Id;
  contactId?: Id;
  companyId?: Id;
};

export type CreateTaskInput = {
  leadId?: Id;
  contactId?: Id;
  companyId?: Id;
  typeId: Id;
  text?: string;
  dueAt: string;
  responsibleUserId?: Id | null;
};

export type CreateLeadInput = {
  name: string;
  priceMinor?: number;
  stageId?: Id;
  responsibleUserId?: Id | null;
  /** Var olan bir kişi. Verilirse contactName yok sayılır; kişinin şirketi lead'e de yazılır. */
  contactId?: Id;
  /** Yeni bir kişi oluşturur. Aynı adla kişi olup olmadığına bakılmaz; arayüz bunun yerine contactId gönderir. */
  contactName?: string;
  tagIds?: Id[];
};

export type StageNames = { incoming: string; open: string[]; won: string; lost: string };

export type UpdateLeadInput = {
  name?: string;
  priceMinor?: number;
  responsibleUserId?: Id | null;
  /** Ana kişi. null verilirse kişi lead'den ayrılır (kişi silinmez). */
  contactId?: Id | null;
  companyId?: Id | null;
  /** Yalnız verilen alanlar değişir; null alanı boşaltır. */
  custom?: CustomValues;
  /** Yalnız lead kaybedildi aşamasındayken (ya da oraya taşınırken) verilebilir; null nedeni kaldırır. */
  lossReasonId?: Id | null;
  stageId?: Id;
  /** Aşama değişirken zorunlu: istemcinin gördüğü aşama. Uyuşmazsa 409 döner. */
  expectedStageId?: Id;
};

/* ---------- raporlar ---------- */

export type Insights = {
  /** Dönem: çalışma alanının saat diliminde gün sayısı ve ilk/son gün (yyyy-aa-gg). */
  range: { days: number; from: string; to: string };
  totals: {
    created: number;
    won: number;
    wonMinor: number;
    lost: number;
    lostMinor: number;
    /** Şu anki açık lead'ler (dönemden bağımsız). */
    open: number;
    openMinor: number;
    tasksDone: number;
    /** Şu an gecikmiş açık görevler (dönemden bağımsız). */
    tasksOverdue: number;
  };
  /** Dönemin her günü için oluşturulan lead sayısı; lead olmayan günler de vardır. */
  daily: Array<{ day: string; created: number }>;
  /** Açık aşamalardaki lead'ler, pipeline ve aşama sırasıyla. */
  stages: Array<{ id: Id; name: string; pipeline: string; count: number; totalMinor: number }>;
  /** Dönemde kaybedilen lead'lerin nedenleri, çoktan aza. id null: neden belirtilmemiş. */
  lossReasons: Array<{ id: Id | null; name: string | null; count: number }>;
  /** Kişi başına: oluşturduğu lead'ler; şu anki sorumlusu olduğu kazanılan ve kaybedilenler. id null: sahipsiz ya da otomatik. */
  users: Array<{ id: Id | null; name: string | null; created: number; won: number; lost: number; wonMinor: number }>;
  /** Son etkinlikler, yeniden eskiye. */
  events: Array<LeadEvent & { leadName: string }>;
};

/** Kullanıcının adlandırıp sakladığı süzgeç. criteria ekranın süzgeç durumudur; sunucu içeriğine bakmaz. */
export type SavedFilter = { id: Id; name: string; criteria: Record<string, unknown> };

/* ---------- ekip ve yetkiler ---------- */

/** Bir yetkinin kapsamı: hiç, yalnız sorumlusu olduğu kayıtlar, grubunun kayıtları, hepsi. Sahipsiz kayıt herkese açıktır. */
export type AccessLevel = "none" | "own" | "group" | "all";

export type RecordRights = { view: AccessLevel; edit: AccessLevel; add: boolean; delete: AccessLevel; export: AccessLevel };

export type Rights = {
  leads: RecordRights;
  contacts: RecordRights;
  companies: RecordRights;
  tasks: { view: AccessLevel; edit: AccessLevel; delete: AccessLevel };
  inbox: { view: AccessLevel };
};

export type Group = { id: Id; name: string };

/** Ekip üyesi. rights yalnız yöneticiye döner; yöneticinin kendi yetkileri sınırsızdır. */
export type Member = { id: Id; name: string; email: string; isAdmin: boolean; isActive: boolean; groupId: Id | null; rights: Rights | null };

export type SearchResults = {
  leads: Array<{ id: Id; name: string; detail: string | null }>;
  contacts: Array<{ id: Id; name: string; detail: string | null }>;
  companies: Array<{ id: Id; name: string; detail: string | null }>;
};

/* ---------- otomasyonlar ---------- */

/** Tetikleyiciyi başlatan olay: lead bu aşamada oluşturuldu ya da bu aşamaya taşındı. */
export type AutomationEvent = "lead_created" | "stage_entered";

export type AutomationAction =
  /** Sorumluyu belirler: tek bir kullanıcı ya da seçilenler arasında sırayla. Sırayla dağıtım, sorumlusu olan lead'e dokunmaz. */
  | { kind: "change_responsible"; settings: { mode: "user"; userId: Id } | { mode: "round_robin"; userIds: Id[] } }
  /** responsible: "lead" lead'in sorumlusu demektir; yoksa görev atanmamış kalır. */
  | { kind: "add_task"; settings: { typeId: Id; text: string; dueInMinutes: number; responsible: "lead" | Id } }
  | { kind: "change_stage"; settings: { stageId: Id } }
  | { kind: "edit_tags"; settings: { add: Id[]; remove: Id[] } };

export type Automation = AutomationAction & {
  id: Id;
  pipelineId: Id;
  stageId: Id;
  onEvent: AutomationEvent;
  isActive: boolean;
  sort: number;
};

export type AutomationInput = AutomationAction & { stageId: Id; onEvent: AutomationEvent; isActive?: boolean };

/* ---------- lead alma kapısı ---------- */

/** Dış sistemlerin lead gönderdiği kapı. Gizli adres yalnız oluşturulurken ve yenilenirken bir kez döner. */
export type Intake = {
  id: Id;
  name: string;
  kind: "generic" | "google_sheets";
  /** Katalogdaki kaynak: hangi kurulum yönergesinin ve hangi adın gösterileceğini belirler. */
  provider: IntakeProvider;
  pipelineId: Id;
  stageId: Id;
  tagId: Id | null;
  isActive: boolean;
  lastReceivedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type IntakeProvider = "generic" | "google_sheets" | "google_forms" | "zapier" | "make" | "n8n";

export type IntakeInput = { name: string; kind: Intake["kind"]; provider?: IntakeProvider; stageId: Id; tagId?: Id | null };

/* ---------- Google hesabıyla bağlanan tablolar ---------- */

export type GoogleAccount = { id: Id; email: string; status: "active" | "reconnect" };

/** Bu kurulumda Google bağlantısının durumu. mode "dev": gerçek anahtar yok, yerel taklit kullanılıyor. */
export type GoogleStatus = { configured: boolean; mode: "live" | "dev" | null; pickerKey: string | null; appId: string | null; accounts: GoogleAccount[] };

export type SheetInspection = { spreadsheetId: string; name: string; tabs: Array<{ sheetId: number; title: string; header: string[] }> };

/** Bir lead alma kapısına bağlı Google tablosu. */
export type SheetLink = {
  id: Id;
  intakeId: Id;
  email: string;
  accountStatus: GoogleAccount["status"];
  spreadsheetName: string;
  sheetTitle: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Google değişiklik bildirimi açık: yeni satır saniyeler içinde gelir. Kapalıysa tablo aralıklarla yoklanır. */
  watching: boolean;
};

export type SheetLinkInput = { accountId: Id; spreadsheetId: string; sheetId: number; name: string; stageId: Id; tagId?: Id | null; importExisting?: boolean };

export type ApiErrorBody = { error: { code: string; message: string } };
