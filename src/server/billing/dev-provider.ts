// Yalnız geliştirme: ödeme sağlayıcısı taklidi. Ödeme sayfası (/dev/checkout/…), abonelik, fatura ve imzalı bildirim
// üretir; gerçek para ya da kart yoktur. Durum bu sürecin belleğindedir. Üretimde bu sağlayıcı seçilmez.
import { randomUUID } from "node:crypto";
import type { BillingPeriod, Invoice } from "@/lib/billing";
import { sign, verify } from "../secret-box";
import type { BillingEvent, BillingProvider } from "./provider";

type Session = { id: string; workspaceId: string; seats: number; period: BillingPeriod; amountMinor: number; currency: string; returnUrl: string; status: "open" | "paid" | "declined" };
type Sub = { id: string; customerId: string; workspaceId: string; seats: number; period: BillingPeriod; currentPeriodEnd: string; cancelAtPeriodEnd: boolean };
type State = { sessions: Map<string, Session>; subs: Map<string, Sub>; invoices: Array<Invoice & { workspaceId: string }>; events: BillingEvent[]; counter: number };

const globalFake = globalThis as typeof globalThis & { __yscFakeBilling?: State };
const fresh = (): State => ({ sessions: new Map(), subs: new Map(), invoices: [], events: [], counter: 0 });
const state = () => (globalFake.__yscFakeBilling ??= fresh());

export function resetFakeBilling(): void {
  globalFake.__yscFakeBilling = fresh();
}

const periodEnd = (period: BillingPeriod, from = Date.now()) => {
  const date = new Date(from);
  if (period === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
};

/** Olayı, gerçek sağlayıcının yapacağı gibi imzalı bir bildirimle uygulamaya gönderir. */
export async function emitDevBillingEvent(origin: string, event: Omit<BillingEvent, "id"> & { id?: string }, options: { signature?: string } = {}): Promise<number> {
  const full: BillingEvent = { ...event, id: event.id ?? `evt_${++state().counter}` };
  state().events.push(full);
  const body = JSON.stringify(full);
  const response = await fetch(`${origin}/api/hooks/billing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Billing-Signature": options.signature ?? sign(body) },
    body,
  });
  return response.status;
}

const subEvent = (sub: Sub, type: BillingEvent["type"]): Omit<BillingEvent, "id"> => ({
  type,
  workspaceId: sub.workspaceId,
  customerId: sub.customerId,
  subscriptionId: sub.id,
  seats: sub.seats,
  period: sub.period,
  currentPeriodEnd: sub.currentPeriodEnd,
  cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
});

export const devCheckoutSession = (id: string) => state().sessions.get(id) ?? null;
/** index verilmezse son olay; 0 ilk olay. */
export const devEvent = (index = -1) => state().events.at(index) ?? null;
export const devSubscription = (workspaceId: string) => [...state().subs.values()].find((sub) => sub.workspaceId === workspaceId) ?? null;

/** Ödeme sayfasındaki "öde" ya da "reddet": oturumu kapatır; ödendiyse abonelik ve fatura oluşur, bildirim gider. */
export async function settleDevCheckout(sessionId: string, paid: boolean, origin: string): Promise<{ returnUrl: string } | null> {
  const session = state().sessions.get(sessionId);
  if (!session || session.status !== "open") return null;
  session.status = paid ? "paid" : "declined";
  if (!paid) {
    state().invoices.push({ id: `inv_${++state().counter}`, workspaceId: session.workspaceId, createdAt: new Date().toISOString(), amountMinor: session.amountMinor, currency: session.currency, status: "failed", seats: session.seats, period: session.period });
    return { returnUrl: `${session.returnUrl}?checkout=canceled` };
  }
  const previous = devSubscription(session.workspaceId);
  if (previous) state().subs.delete(previous.id);
  const sub: Sub = { id: `sub_${randomUUID()}`, customerId: previous?.customerId ?? `cus_${randomUUID()}`, workspaceId: session.workspaceId, seats: session.seats, period: session.period, currentPeriodEnd: periodEnd(session.period), cancelAtPeriodEnd: false };
  state().subs.set(sub.id, sub);
  state().invoices.push({ id: `inv_${++state().counter}`, workspaceId: session.workspaceId, createdAt: new Date().toISOString(), amountMinor: session.amountMinor, currency: session.currency, status: "paid", seats: session.seats, period: session.period });
  await emitDevBillingEvent(origin, subEvent(sub, "subscription.activated"));
  return { returnUrl: `${session.returnUrl}?checkout=success` };
}

export const devBillingProvider: BillingProvider = {
  id: "dev",
  sandbox: true,

  async createCheckout(input) {
    const id = randomUUID();
    state().sessions.set(id, { id, workspaceId: input.workspaceId, seats: input.seats, period: input.period, amountMinor: input.amountMinor, currency: input.currency, returnUrl: input.returnUrl, status: "open" });
    return { url: `${input.origin}/dev/checkout/${id}` };
  },

  async updateSeats(subscriptionId, seats, origin) {
    const sub = state().subs.get(subscriptionId);
    if (!sub) throw new Error("unknown subscription");
    sub.seats = seats;
    await emitDevBillingEvent(origin, subEvent(sub, "subscription.updated"));
  },

  async setCancelAtPeriodEnd(subscriptionId, cancel, origin) {
    const sub = state().subs.get(subscriptionId);
    if (!sub) throw new Error("unknown subscription");
    sub.cancelAtPeriodEnd = cancel;
    await emitDevBillingEvent(origin, subEvent(sub, "subscription.updated"));
  },

  async listInvoices(workspaceId) {
    return state()
      .invoices.filter((invoice) => invoice.workspaceId === workspaceId)
      .map(({ id, createdAt, amountMinor, currency, status, seats, period }) => ({ id, createdAt, amountMinor, currency, status, seats, period }))
      .reverse();
  },

  verifyWebhook(rawBody, signature) {
    if (!signature || !verify(rawBody, signature)) return null;
    try {
      return JSON.parse(rawBody) as BillingEvent;
    } catch {
      return null;
    }
  },
};
