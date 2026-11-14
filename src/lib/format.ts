import { fill } from "@/i18n/fill";
import type { Messages } from "@/i18n/tr";

/** Küçük birimdeki tutarı (kuruş) yerel para biçiminde yazar. Kuruş yoksa ondalık göstermez. */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100);
}

/** "64.000" ya da "64000,50" gibi bir girdiyi küçük birime çevirir. Geçersizse null. */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "");
  if (cleaned === "") return 0;
  // Türkçe yazım: nokta binlik, virgül ondalık. Tek ayırıcı nokta ve ardından 1-2 hane varsa ondalık sayılır.
  let normalized = cleaned;
  if (cleaned.includes(",")) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Kısa göreli süre: "şimdi", "5 dk", "3 sa", "2 g". */
export function formatAgo(iso: string | null, now: number, t: Messages["time"]): string {
  if (!iso) return "";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t.now;
  if (minutes < 60) return fill(t.minutes, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return fill(t.hours, { n: hours });
  return fill(t.days, { n: Math.floor(hours / 24) });
}

/** Bugünse saat, değilse gün ve ay. */
export function formatClock(iso: string, now: number, locale: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "short" });
  if (day.format(date) === day.format(new Date(now))) {
    return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" }).format(date);
}

export function formatDateTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
