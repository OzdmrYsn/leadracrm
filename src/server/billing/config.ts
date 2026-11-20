// Fiyat ve ödeme sağlayıcısı ayarı. Tutar henüz kesinleşmedi: BILLING_SEAT_MONTHLY_MINOR verilene kadar aşağıdaki
// yer tutucu kullanılır ve arayüz bunu "geçici fiyat" diye gösterir. Yer tutucuyla gerçek ödeme alınamaz, çünkü
// gerçek bir ödeme sağlayıcısı bağlanmadan ödeme başlatılamaz.
import type { Price } from "@/lib/billing";

const PLACEHOLDER_SEAT_MONTHLY_MINOR = 49_900;

export function billingPrice(): Price {
  const configured = Number(process.env.BILLING_SEAT_MONTHLY_MINOR);
  const decided = Number.isInteger(configured) && configured > 0;
  return {
    currency: process.env.BILLING_CURRENCY || "TRY",
    seatMonthlyMinor: decided ? configured : PLACEHOLDER_SEAT_MONTHLY_MINOR,
    // Yıllık ödemede 2 ay ücretsiz.
    yearMonths: 10,
    provisional: !decided,
  };
}
