// Bir isteğin veritabanı bağlamı: oturumdaki kullanıcı, çalışma alanı ve açık işlem.
import { effectiveState, isReadOnly, MAX_SEATS, type BillingPeriod, type SubscriptionState } from "@/lib/billing";
import type { DateFormat, Id, Rights, TimeFormat, User, Workspace } from "@/lib/types";
import { currentUserId } from "../auth";
import { asUser, type Tx } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { normalizeRights } from "./rights";

export type Ctx = {
  sql: Tx;
  ws: { id: Id; slug: string; name: string; currency: string; locale: string; timezone: string; timeFormat: TimeFormat; dateFormat: DateFormat };
  /** Abonelik: etkin durum ve koltuk sayısı. readOnly ise bu işlem veritabanına yazamaz. */
  subscription: {
    state: SubscriptionState;
    readOnly: boolean;
    seats: number;
    period: BillingPeriod | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    providerSubscriptionId: string | null;
  };
  user: User;
  /** Üyenin grubu ve yetkileri. Yönetici için yetkiler okunmaz: her şeyi yapabilir. */
  groupId: Id | null;
  rights: Rights;
  /**
   * RLS'in istemciye kapattığı yazmalar (olay günlüğü, mesaj durumu) için kısa süreli sunucu rolü.
   * İçeride yalnız sunucunun kendi ürettiği veri yazılır.
   */
  system: <T>(work: () => Promise<T>) => Promise<T>;
};

/**
 * Oturumdaki kullanıcıyla, verilen çalışma alanında bir işlem açar.
 * Kullanıcı bu çalışma alanının etkin üyesi değilse 404 döner: başka bir kiracının varlığı bile sızmaz.
 */
export async function inWorkspace<T>(slug: string, work: (ctx: Ctx) => Promise<T>, options: { whenReadOnly?: "allow" } = {}): Promise<T> {
  const userId = await currentUserId();
  if (!userId) throw new DataError(401, "unauthenticated");
  return asUser(userId, async (sql) => {
    const [row] = await sql<
      Array<{
        id: Id;
        slug: string;
        name: string;
        currency: string;
        language: string;
        country: string | null;
        timezone: string;
        timeFormat: TimeFormat;
        dateFormat: DateFormat;
        isAdmin: boolean;
        fullName: string;
        email: string;
        groupId: Id | null;
        rights: unknown;
        subStatus: string | null;
        subSeats: number | null;
        subPeriod: BillingPeriod | null;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean | null;
        providerSubscriptionId: string | null;
      }>
    >`
      select w.id, w.slug, w.name, w.currency, w.language, w.country, w.timezone, w.time_format, w.date_format, m.is_admin, p.full_name, p.email, m.group_id,
        case when m.role_id is not null then r.rights else m.rights end as rights,
        s.status as sub_status, s.seats as sub_seats, s.billing_period as sub_period, s.trial_ends_at, s.current_period_end,
        s.cancel_at_period_end, s.provider_subscription_id
      from workspaces w
      join workspace_members m on m.workspace_id = w.id and m.user_id = ${userId} and m.is_active
      join profiles p on p.id = m.user_id
      left join roles r on r.id = m.role_id
      left join subscriptions s on s.workspace_id = w.id
      where w.slug = ${slug}`;
    if (!row) throw notFound("workspace");
    // Abonelik kaydı olmayan çalışma alanı (olmamalı) kısıtlanmaz; kayıt her çalışma alanıyla birlikte açılır.
    const state: SubscriptionState = row.subStatus === null ? "active" : effectiveState({ status: row.subStatus, trialEndsAt: row.trialEndsAt, currentPeriodEnd: row.currentPeriodEnd }, Date.now());
    const readOnly = isReadOnly(state);
    // Abonelik etkin değilse işlem salt okunur açılır: hangi uç çağrılırsa çağrılsın veritabanı yazmayı reddeder
    // (25006 → 402 subscription_required). Veri okunur ve dışa aktarılır. Faturalandırma işlemleri bundan muaftır.
    if (readOnly && options.whenReadOnly !== "allow") await sql`set local transaction_read_only = on`;
    const ctx: Ctx = {
      sql,
      ws: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        currency: row.currency,
        locale: row.country ? `${row.language}-${row.country}` : row.language,
        timezone: row.timezone,
        timeFormat: row.timeFormat,
        dateFormat: row.dateFormat,
      },
      subscription: {
        state,
        readOnly,
        seats: row.subSeats ?? MAX_SEATS,
        period: row.subPeriod,
        trialEndsAt: row.trialEndsAt,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
        providerSubscriptionId: row.providerSubscriptionId,
      },
      user: { id: userId, name: row.fullName, email: row.email, isAdmin: row.isAdmin, groupId: row.groupId },
      groupId: row.groupId,
      rights: normalizeRights(row.rights),
      system: async (inner) => {
        await sql`set local role service_role`;
        const result = await inner();
        await sql`set local role authenticated`;
        return result;
      },
    };
    return work(ctx);
  });
}

/**
 * Devir: kaydı başka birine atamak, onu atayanın görme kapsamından çıkarabilir. Veritabanı, yazılan satırı
 * yazanın da görebilmesini şart koşar ve böyle bir yazmayı reddeder; kapsamı "kendi" olan üye iş arkadaşına
 * görev veremez, lead devredemez olurdu. Bu noktada yetki zaten denetlenmiştir: kaydı görebildiği için okudu,
 * düzenleme ya da ekleme yetkisi sınandı, yeni sorumlu bu çalışma alanının etkin üyesi. Bu yüzden başkasına
 * atayan yazma ve sonucunun okunması sunucu rolüyle yapılır.
 * İçeride ctx.system çağırmayın: iç çağrı bitince rol kullanıcıya döner.
 */
export function handoff<T>(ctx: Ctx, responsibleUserId: Id | null, work: () => Promise<T>): Promise<T> {
  const toSomeoneElse = responsibleUserId !== null && responsibleUserId !== ctx.user.id;
  return toSomeoneElse && !ctx.user.isAdmin ? ctx.system(work) : work();
}

export function requireAdmin(ctx: Ctx): void {
  if (!ctx.user.isAdmin) throw new DataError(403, "forbidden", "admin only");
}

/** Çalışma alanının etkin üyeleri, ada göre. */
export async function listUsers(ctx: Ctx): Promise<User[]> {
  const rows = await ctx.sql<User[]>`
    select p.id, p.full_name as name, p.email, m.is_admin, m.group_id
    from workspace_members m join profiles p on p.id = m.user_id
    where m.workspace_id = ${ctx.ws.id} and m.is_active`;
  return rows.map((row) => ({ ...row })).sort((a, b) => a.name.localeCompare(b.name, ctx.ws.locale));
}

/** Sorumlu olarak atanabilecek kullanıcıyı doğrular. null "atanmamış" demektir. */
export async function checkUser(ctx: Ctx, userId: Id | null): Promise<Id | null> {
  if (userId === null) return null;
  if (!isUuid(userId)) throw notFound("user");
  const [row] = await ctx.sql`
    select 1 from workspace_members where workspace_id = ${ctx.ws.id} and user_id = ${userId} and is_active`;
  if (!row) throw notFound("user");
  return userId;
}

type EventType = "lead_created" | "lead_accepted" | "request_linked" | "stage_changed" | "responsible_changed" | "task_added" | "task_completed";

/** Lead'in akışına bir olay yazar. Olay günlüğüne istemci yazamaz; bu yüzden sunucu rolüyle eklenir. */
export async function logEvent(
  ctx: Ctx,
  event: { leadId: Id; type: EventType; from?: string | null; to?: string | null; bySystem?: boolean },
): Promise<void> {
  const { sql } = ctx;
  const before = event.from == null ? null : sql.json({ text: event.from });
  const after = event.to == null ? null : sql.json({ text: event.to });
  await ctx.system(
    () => sql`
      insert into events (workspace_id, type, lead_id, actor_kind, actor_user_id, value_before, value_after)
      values (${ctx.ws.id}, ${event.type}, ${event.leadId}, ${event.bySystem ? "system" : "user"}, ${event.bySystem ? null : ctx.user.id}, ${before}, ${after})`,
  );
}

/** Dizgileri çalışma alanının diline göre sıralar. */
export const byName = <T extends { name: string }>(ctx: Ctx, rows: T[]): T[] => rows.sort((a, b) => a.name.localeCompare(b.name, ctx.ws.locale));

/**
 * İstemciye giden çalışma alanı. Yerel ayara saat biçimi eklenir (BCP 47 "hc" uzantısı); böylece saat yazan her yer
 * ayrıca bir seçenek taşımadan doğru biçimi kullanır. Sunucu içinde (sıralama, CSV ayırıcı) yalın yerel ayar kullanılır.
 */
export function workspaceOf(ws: Ctx["ws"]): Workspace {
  return {
    slug: ws.slug,
    name: ws.name,
    currency: ws.currency,
    locale: `${ws.locale}-u-hc-${ws.timeFormat === "12" ? "h12" : "h23"}`,
    timezone: ws.timezone,
    timeFormat: ws.timeFormat,
    dateFormat: ws.dateFormat,
  };
}

