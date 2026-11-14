import { expect, test } from "@playwright/test";
import { addDays, addMonths, dayOf, dayRange, isDay, isTime, monthGrid, startOfWeek, timeOf, weekDays, weekdayIndex, zonedToUtc } from "../src/lib/dates";
import { fold } from "../src/lib/text";
import { parseMoney } from "../src/lib/format";

// Tarayıcı gerektirmeyen birim testleri: takvim günü hesapları, Türkçe harf katlama, tutar ayrıştırma.
test.describe("F06 tarih ve saat dilimi hesapları", () => {
  test("F06-U1 duvar saati çalışma alanının diliminde ana çevrilir", () => {
    expect(zonedToUtc("2026-11-14", "10:00", "Europe/Istanbul").toISOString()).toBe("2026-11-14T07:00:00.000Z");
    expect(zonedToUtc("2026-01-15", "09:30", "America/New_York").toISOString()).toBe("2026-01-15T14:30:00.000Z");
    expect(zonedToUtc("2026-07-15", "09:30", "America/New_York").toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });

  test("F06-U2 yaz saati geçişi: var olmayan saat ileri kayar, yinelenen saat geçerli bir ana düşer", () => {
    // Berlin 29 Mart 2026: 02:00 → 03:00. 02:30 yoktur.
    expect(zonedToUtc("2026-03-29", "02:30", "Europe/Berlin").toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(timeOf("2026-03-29T01:30:00.000Z", "Europe/Berlin")).toBe("03:30");
    // Berlin 25 Ekim 2026: 03:00 → 02:00. 02:30 iki kez yaşanır; ikisinden biri kabul.
    const ambiguous = zonedToUtc("2026-10-25", "02:30", "Europe/Berlin").toISOString();
    expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(ambiguous);
    expect(timeOf(ambiguous, "Europe/Berlin")).toBe("02:30");
  });

  test("F06-U3 bir anın günü dilime göre değişir", () => {
    const instant = "2026-11-14T22:30:00.000Z";
    expect(dayOf(instant, "Europe/Istanbul")).toBe("2026-11-15");
    expect(dayOf(instant, "America/Los_Angeles")).toBe("2026-11-14");
    expect(timeOf(instant, "Europe/Istanbul")).toBe("01:30");
  });

  test("F06-U4 gün aralığı uçları kapsar; yaz saati günü 23 ya da 25 saat sürer", () => {
    expect(dayRange("2026-11-14", "2026-11-14", "Europe/Istanbul")).toEqual({ from: "2026-11-13T21:00:00.000Z", to: "2026-11-14T20:59:59.999Z" });
    const short = dayRange("2026-03-29", "2026-03-29", "Europe/Berlin");
    expect(Date.parse(short.to) - Date.parse(short.from) + 1).toBe(23 * 3_600_000);
    const long = dayRange("2026-10-25", "2026-10-25", "Europe/Berlin");
    expect(Date.parse(long.to) - Date.parse(long.from) + 1).toBe(25 * 3_600_000);
  });

  test("F06-U5 hafta pazartesi başlar; ay ızgarası 42 gündür ve ayın tamamını içerir", () => {
    expect(weekdayIndex("2026-11-13")).toBe(4); // cuma
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09"); // pazar → o haftanın pazartesisi
    expect(weekDays("2026-11-13")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    for (const day of ["2026-02-10", "2026-11-13", "2027-08-01", "2028-02-29"]) {
      const grid = monthGrid(day);
      expect(grid).toHaveLength(42);
      expect(weekdayIndex(grid[0])).toBe(0);
      expect(grid).toContain(`${day.slice(0, 7)}-01`);
      expect(grid).toContain(addDays(addMonths(day, 1), -1));
    }
  });

  test("F06-U6 gün ve ay toplama: yıl sonu, artık yıl, ay sonu", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });

  test("F06-U7 var olmayan gün ve saat reddedilir", () => {
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-04-31")).toBe(false);
    expect(isDay("26-04-01")).toBe(false);
    expect(isDay("")).toBe(false);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("9:30")).toBe(false);
  });
});

test.describe("F07 metin katlama ve tutar", () => {
  test("F07-U1 Türkçe I/ı/İ/i tek harf sayılır; diğer harfler küçülür", () => {
    expect(fold("VIP")).toBe(fold("vip"));
    expect(fold("VİP")).toBe(fold("vıp"));
    expect(fold("KİTAPLIK")).toBe(fold("kitaplık"));
    expect(fold("Iğdır")).toBe(fold("ığdır"));
    expect(fold("ŞÖMİNE ÇEVRESİ")).toBe(fold("şömine çevresi"));
    expect(fold("  Ada  ")).toBe(fold("ada"));
  });

  test("F03-U1 tutar ayrıştırma: Türkçe yazım kabul edilir, geçersiz olan reddedilir", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("1500")).toBe(150_000);
    expect(parseMoney("12.500,50")).toBe(1_250_050);
    expect(parseMoney("0,5")).toBe(50);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("12,5,3")).toBeNull();
  });
});
