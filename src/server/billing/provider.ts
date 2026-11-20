// Ödeme sağlayıcısı arayüzü. Uygulama kart bilgisi görmez: ödeme sağlayıcının sayfasında yapılır, sonuç imzalı bir
// bildirimle (webhook) gelir ve abonelik durumu yalnız o bildirimle değişir. Gerçek sağlayıcı henüz seçilmedi;
// şimdilik yalnız geliştirmede çalışan bir taklit vardır.
import type { BillingPeriod, Invoice } from "@/lib/billing";
import { isProduction } from "../auth";
import { devBillingProvider } from "./dev-provider";

export type BillingEvent = {
  /** Sağlayıcının olay kimliği: aynı olay ikinci kez işlenmez. */
  id: string;
  type: "subscription.activated" | "subscription.updated" | "subscription.canceled" | "payment.failed";
  workspaceId: string;
  customerId?: string;
  subscriptionId?: string;
  seats?: number;
  period?: BillingPeriod;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
};

export type CheckoutInput = {
  workspaceId: string;
  seats: number;
  period: BillingPeriod;
  amountMinor: number;
  currency: string;
  /** Ödeme bitince dönülecek adres; sonuna ?checkout=success ya da ?checkout=canceled eklenir. */
  returnUrl: string;
  origin: string;
};

export type BillingProvider = {
  id: string;
  sandbox: boolean;
  createCheckout: (input: CheckoutInput) => Promise<{ url: string }>;
  updateSeats: (subscriptionId: string, seats: number, origin: string) => Promise<void>;
  /** Dönem sonunda sona erecek şekilde iptal eder (ya da iptali geri alır). */
  setCancelAtPeriodEnd: (subscriptionId: string, cancel: boolean, origin: string) => Promise<void>;
  listInvoices: (workspaceId: string) => Promise<Invoice[]>;
  /** Bildirimin imzasını doğrular ve olaya çevirir; imza tutmuyorsa null. */
  verifyWebhook: (rawBody: string, signature: string | null) => BillingEvent | null;
};

/** Bağlı ödeme sağlayıcısı. Üretimde henüz yoktur: ödeme başlatılamaz (503). */
export function billingProvider(): BillingProvider | null {
  if (isProduction()) return null;
  return devBillingProvider;
}
