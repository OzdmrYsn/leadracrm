// Abonelik ve koltuk. Abonelik durumu yalnız ödeme sağlayıcısının imzalı bildirimiyle değişir; istemciden gelen
// hiçbir bilgiye güvenilmez. Faturalandırma işlemleri abonelik etkin değilken de (salt okunur kipte) çalışır.
import {
  MAX_SEATS,
  periodTotal,
  type Billing,
  type BillingPeriod,
  type Subscription,
} from "@/lib/billing";
import { billingPrice } from "../billing/config";
import { billingProvider, type BillingEvent } from "../billing/provider";
import { asService } from "../db";
import { DataError, isUuid } from "../errors";
import { inWorkspace, requireAdmin, type Ctx } from "./ctx";

async function seatsUsed(ctx: Ctx): Promise<number> {
  const [{ used }] = await ctx.sql<Array<{ used: number }>>`
    select count(*)::int as used from workspace_members where workspace_id = ${ctx.ws.id} and is_active`;
  return used;
}

/** Oturumdaki özet: durum, koltuk kullanımı, tarihler. Her üye görür (uyarı şeritleri bununla çizilir). */
export async function subscriptionOf(ctx: Ctx): Promise<Subscription> {
  const { state, readOnly, seats, period, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd } = ctx.subscription;
  return { state, readOnly, seats, seatsUsed: await seatsUsed(ctx), period, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd };
}

/** Faturalandırma ekranı: abonelik, fiyat ve faturalar. Yalnız yönetici. */
export function getBilling(ws: string): Promise<Billing> {
  return inWorkspace(
    ws,
    async (ctx) => {
      requireAdmin(ctx);
      const provider = billingProvider();
      return {
        subscription: await subscriptionOf(ctx),
        price: billingPrice(),
        canPay: provider !== null,
        sandbox: provider?.sandbox ?? false,
        invoices: provider ? await provider.listInvoices(ctx.ws.id) : [],
      };
    },
    { whenReadOnly: "allow" },
  );
}

function requireProvider() {
  const provider = billingProvider();
  if (!provider) throw new DataError(503, "billing_unavailable", "no payment provider is configured");
  return provider;
}

function checkSeats(seats: number, used: number): void {
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) throw new DataError(422, "validation", "seats out of range");
  if (seats < used) throw new DataError(422, "seats_below_members", `${used} active members need at least ${used} seats`);
}

/**
 * Ödeme sayfasını açar. Koltuk sayısı etkin üye sayısından az olamaz. Abonelik zaten etkinse ödeme yeniden başlatılmaz:
 * koltuk sayısı ayrıca değiştirilir.
 */
export async function startCheckout(ws: string, input: { seats: number; period: BillingPeriod }, origin: string): Promise<{ url: string }> {
  const provider = requireProvider();
  const target = await inWorkspace(
    ws,
    async (ctx) => {
      requireAdmin(ctx);
      if (ctx.subscription.state === "active") throw new DataError(409, "already_subscribed");
      checkSeats(input.seats, await seatsUsed(ctx));
      return { workspaceId: ctx.ws.id, slug: ctx.ws.slug };
    },
    { whenReadOnly: "allow" },
  );
  const price = billingPrice();
  return provider.createCheckout({
    workspaceId: target.workspaceId,
    seats: input.seats,
    period: input.period,
    amountMinor: periodTotal(price, input.seats, input.period),
    currency: price.currency,
    returnUrl: `${origin}/w/${target.slug}/settings/billing`,
    origin,
  });
}

/** Etkin abonelikte koltuk sayısını değiştirir. Sonuç sağlayıcının bildirimiyle yazılır. */
export async function changeSeats(ws: string, seats: number, origin: string): Promise<void> {
  const provider = requireProvider();
  const subscriptionId = await inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (ctx.subscription.state !== "active" || !ctx.subscription.providerSubscriptionId) throw new DataError(409, "not_subscribed");
    checkSeats(seats, await seatsUsed(ctx));
    return ctx.subscription.providerSubscriptionId;
  });
  await provider.updateSeats(subscriptionId, seats, origin);
}

/**
 * Tek tıkla iptal: abonelik dönem sonunda sona erer, o güne kadar kullanım sürer. cancel false ise iptal geri alınır.
 * Ödeme alınamadığı için ek sürede olan abonelik de iptal edilebilir.
 */
export async function setCancellation(ws: string, cancel: boolean, origin: string): Promise<void> {
  const provider = requireProvider();
  const subscriptionId = await inWorkspace(
    ws,
    async (ctx) => {
      requireAdmin(ctx);
      const { state, providerSubscriptionId } = ctx.subscription;
      if (!providerSubscriptionId || (state !== "active" && state !== "past_due")) throw new DataError(409, "not_subscribed");
      return providerSubscriptionId;
    },
    { whenReadOnly: "allow" },
  );
  await provider.setCancelAtPeriodEnd(subscriptionId, cancel, origin);
}

/**
 * Ödeme sağlayıcısının bildirimini işler. İmza doğrulanmış olmalıdır. Aynı olay ikinci kez gelirse yeniden uygulanmaz.
 * Bilinmeyen çalışma alanı sessizce atlanır (sağlayıcı yeniden denemesin).
 */
export function applyBillingEvent(providerId: string, event: BillingEvent): Promise<{ applied: boolean }> {
  return asService(async (sql) => {
    if (!isUuid(event.workspaceId)) return { applied: false };
    const [fresh] = await sql<Array<{ id: string }>>`
      insert into webhook_inbox (provider, channel_id, external_event_id, payload)
      values ('billing', null, ${`${providerId}:${event.id}`}, ${sql.json(JSON.parse(JSON.stringify(event)))})
      on conflict (provider, channel_id, external_event_id) do nothing
      returning id`;
    if (!fresh) return { applied: false };
    const [workspace] = await sql`select 1 from workspaces where id = ${event.workspaceId}`;
    if (workspace) {
      if (event.type === "subscription.activated" || event.type === "subscription.updated") {
        const seats = Math.min(Math.max(1, Math.trunc(event.seats ?? 1)), MAX_SEATS);
        await sql`
          insert into subscriptions (workspace_id, provider, provider_customer_id, provider_subscription_id, plan, seats, status,
                                     current_period_end, billing_period, cancel_at_period_end)
          values (${event.workspaceId}, ${providerId}, ${event.customerId ?? null}, ${event.subscriptionId ?? null}, 'base', ${seats}, 'active',
                  ${event.currentPeriodEnd ?? null}, ${event.period ?? null}, ${event.cancelAtPeriodEnd ?? false})
          on conflict (workspace_id) do update set
            provider = excluded.provider, provider_customer_id = excluded.provider_customer_id,
            provider_subscription_id = excluded.provider_subscription_id, plan = 'base', seats = excluded.seats, status = 'active',
            current_period_end = excluded.current_period_end, billing_period = excluded.billing_period,
            cancel_at_period_end = excluded.cancel_at_period_end`;
      } else if (event.type === "subscription.canceled") {
        await sql`update subscriptions set status = 'canceled', cancel_at_period_end = false where workspace_id = ${event.workspaceId}`;
      } else if (event.type === "payment.failed") {
        await sql`update subscriptions set status = 'past_due' where workspace_id = ${event.workspaceId} and status = 'active'`;
      }
    }
    await sql`update webhook_inbox set processed_at = now(), attempts = attempts + 1 where id = ${fresh.id}`;
    return { applied: Boolean(workspace) };
  });
}

/** Yalnız geliştirme: testlerin abonelik tarihlerini oynatması için (deneme bitsin, dönem geçsin). */
export function devShiftSubscription(ws: string, input: { trialEndsInDays?: number; periodEndsInDays?: number }): Promise<void> {
  return asService(async (sql) => {
    const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    if (input.trialEndsInDays !== undefined) {
      await sql`update subscriptions set trial_ends_at = ${day(input.trialEndsInDays)} where workspace_id = (select id from workspaces where slug = ${ws})`;
    }
    if (input.periodEndsInDays !== undefined) {
      await sql`update subscriptions set current_period_end = ${day(input.periodEndsInDays)} where workspace_id = (select id from workspaces where slug = ${ws})`;
    }
  });
}
