// Abonelik: istemci ve sunucunun ortak kullandığı türler ve hesaplar.

export type BillingPeriod = "month" | "year";

/**
 * Aboneliğin etkin durumu (süreler hesaba katılmış):
 * trialing deneme sürüyor · active ödeme güncel · past_due ödeme alınamadı, ek süre işliyor ·
 * expired deneme ya da ek süre bitti · canceled abonelik sona erdi.
 */
export type SubscriptionState = "trialing" | "active" | "past_due" | "expired" | "canceled";

export type Price = {
  currency: string;
  /** Bir koltuğun aylık ücreti, küçük birimde (kuruş). */
  seatMonthlyMinor: number;
  /** Yıllık ödemede ücretlendirilen ay sayısı (12 ay kullanım). */
  yearMonths: number;
  /** Fiyat henüz kesinleşmediyse true: ekranda "geçici" diye belirtilir. */
  provisional: boolean;
};

export type Subscription = {
  state: SubscriptionState;
  /** Değişiklik yapılamaz: veriler okunur ve dışa aktarılır, gelen talepler kaydedilmeye devam eder. */
  readOnly: boolean;
  seats: number;
  /** Etkin üye sayısı. */
  seatsUsed: number;
  period: BillingPeriod | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type Invoice = { id: string; createdAt: string; amountMinor: number; currency: string; status: "paid" | "failed"; seats: number; period: BillingPeriod };

/** Yöneticinin faturalandırma ekranında gördüğü her şey. */
export type Billing = {
  subscription: Subscription;
  price: Price;
  /** Ödeme alınabiliyor mu (bir ödeme sağlayıcısı bağlı mı). */
  canPay: boolean;
  /** Yalnız geliştirme: ödeme yerel taklitle yapılıyor. */
  sandbox: boolean;
  invoices: Invoice[];
};

export const TRIAL_DAYS = 14;
export const TRIAL_SEATS = 10;
/** Ödeme alınamayınca ya da yenileme bildirimi gecikince tanınan ek süre. */
export const GRACE_DAYS = 7;
export const MAX_SEATS = 500;

const DAY = 86_400_000;

export function effectiveState(row: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null }, now: number): SubscriptionState {
  const after = (iso: string | null, extraDays = 0) => iso !== null && Date.parse(iso) + extraDays * DAY > now;
  if (row.status === "trialing") return after(row.trialEndsAt) ? "trialing" : "expired";
  // Dönem bitti ama yenileme bildirimi henüz gelmediyse ek süre boyunca etkin sayılır.
  if (row.status === "active") return row.currentPeriodEnd === null || after(row.currentPeriodEnd, GRACE_DAYS) ? "active" : "expired";
  if (row.status === "past_due") return after(row.currentPeriodEnd, GRACE_DAYS) ? "past_due" : "expired";
  return "canceled";
}

export const isReadOnly = (state: SubscriptionState) => state === "expired" || state === "canceled";

/** Seçilen koltuk ve dönem için bir dönemlik tutar (küçük birimde). */
export function periodTotal(price: Price, seats: number, period: BillingPeriod): number {
  return price.seatMonthlyMinor * seats * (period === "year" ? price.yearMonths : 1);
}

/** Bugünden hedef tarihe kalan gün (yukarı yuvarlanır; geçmişse 0). */
export function daysLeft(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY));
}
