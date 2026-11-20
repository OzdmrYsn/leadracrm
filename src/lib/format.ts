import { fill } from "@/i18n/fill";
import type { Messages } from "@/i18n/tr";
import type { DateFormat } from "./types";

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

/** Sayıyla yazılan tarih: seçilen sıraya göre. Yıl istenmezse yalnız gün ve ay. */
function numericDate(date: Date, timeZone: string, format: Exclude<DateFormat, "text">, withYear: boolean): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const [day, month, year] = [part("day"), part("month"), part("year")];
  if (format === "dmy") return withYear ? `${day}.${month}.${year}` : `${day}.${month}`;
  if (format === "mdy") return withYear ? `${month}/${day}/${year}` : `${month}/${day}`;
  return withYear ? `${year}-${month}-${day}` : `${month}-${day}`;
}

/** Yalnız saat. 12 ya da 24 saat seçimi yerel ayarın içinde gelir (çalışma alanı ayarı). */
export function formatTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** Yalnız tarih, yılıyla. */
export function formatDate(iso: string, locale: string, timeZone: string, dateFormat: DateFormat = "text"): string {
  const date = new Date(iso);
  if (dateFormat === "text") return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).format(date);
  return numericDate(date, timeZone, dateFormat, true);
}

/** Bugünse saat, değilse gün ve ay. */
export function formatClock(iso: string, now: number, locale: string, timeZone: string, dateFormat: DateFormat = "text"): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "short" });
  if (day.format(date) === day.format(new Date(now))) return formatTime(iso, locale, timeZone);
  if (dateFormat === "text") return new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short" }).format(date);
  return numericDate(date, timeZone, dateFormat, false);
}

export function formatDateTime(iso: string, locale: string, timeZone: string, dateFormat: DateFormat = "text"): string {
  if (dateFormat === "text") return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  return `${numericDate(new Date(iso), timeZone, dateFormat, true)} ${formatTime(iso, locale, timeZone)}`;
}
