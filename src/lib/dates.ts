// Takvim günü hesapları. "Gün" her zaman yyyy-aa-gg biçiminde bir dizgidir ve çalışma alanının
// saat dilimindeki takvim gününü anlatır; an (instant) ise ISO dizgisi ya da Date'tir.
// Gün aritmetiği saat diliminden bağımsızdır (UTC üzerinde yapılır); yalnız gün ↔ an çevirisi dilime bakar.

/** Bir anın, verilen saat dilimindeki takvim günü. */
export function dayOf(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}

/** Bir anın, verilen saat dilimindeki saati: "SS:dd". */
export function timeOf(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}

function parts(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year, month, date];
}

function format(utc: Date): string {
  return utc.toISOString().slice(0, 10);
}

export function addDays(day: string, count: number): string {
  const [year, month, date] = parts(day);
  return format(new Date(Date.UTC(year, month - 1, date + count)));
}

export function addMonths(day: string, count: number): string {
  const [year, month] = parts(day);
  return format(new Date(Date.UTC(year, month - 1 + count, 1)));
}

/** Pazartesi = 0 … Pazar = 6. */
export function weekdayIndex(day: string): number {
  const [year, month, date] = parts(day);
  return (new Date(Date.UTC(year, month - 1, date)).getUTCDay() + 6) % 7;
}

/** Haftanın pazartesisi. */
export function startOfWeek(day: string): string {
  return addDays(day, -weekdayIndex(day));
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Ay görünümü: ayın ilk gününü içeren haftanın pazartesisinden başlayan 42 gün (6 hafta). */
export function monthGrid(day: string): string[] {
  const first = startOfWeek(startOfMonth(day));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

export function weekDays(day: string): string[] {
  const first = startOfWeek(day);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

/** Saat diliminin, verilen anda UTC'den kaç dakika ileride olduğu. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * Saat dilimindeki duvar saatini ana çevirir: ("2026-11-14", "10:00", "Europe/Istanbul") → 07:00 UTC.
 * Yaz saati geçişinde var olmayan saat bir sonraki geçerli ana kayar.
 */
export function zonedToUtc(day: string, time: string, timeZone: string): Date {
  const [year, month, date] = parts(day);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  const first = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  const second = wall - offsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

/** Günün ilk ve son anı (uçlar dahil) — aralık sorguları için. */
export function dayRange(firstDay: string, lastDay: string, timeZone: string): { from: string; to: string } {
  const from = zonedToUtc(firstDay, "00:00", timeZone);
  const to = new Date(zonedToUtc(addDays(lastDay, 1), "00:00", timeZone).getTime() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Gerçek bir takvim günü mü? "2026-02-30" gibi var olmayan günler reddedilir. */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, date] = parts(value);
  return format(new Date(Date.UTC(year, month - 1, date))) === value;
}

export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
