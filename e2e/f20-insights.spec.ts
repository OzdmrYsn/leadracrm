import type { Page } from "@playwright/test";
import { actAs, choose, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, t, test, u, WS } from "./support";

type Insights = {
  range: { days: number; from: string; to: string };
  totals: { created: number; won: number; wonMinor: number; lost: number; lostMinor: number; open: number; openMinor: number; tasksDone: number; tasksOverdue: number };
  daily: Array<{ day: string; created: number }>;
  stages: Array<{ name: string; count: number; totalMinor: number }>;
  lossReasons: Array<{ id: string | null; name: string | null; count: number }>;
  users: Array<{ id: string | null; name: string | null; created: number; won: number; lost: number; wonMinor: number }>;
  events: Array<{ leadName: string; type: string }>;
};

const i = t.insights;
const insights = (api: { get: (path: string) => Promise<unknown> }, query = "") => api.get(`/insights${query}`) as Promise<Insights>;
const summary = (page: Page) => page.getByRole("region", { name: i.summary });
/** Özet satırındaki bir kutu: etiketiyle bulunur. */
const tile = (page: Page, label: string) => summary(page).locator("div").filter({ has: page.getByText(label, { exact: true }) });
const card = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });

async function gotoInsights(page: Page) {
  await page.goto(`/w/${WS}/insights`);
  await expect(summary(page)).toBeVisible();
}

test.describe("F20 Performansı izle", () => {
  test("F20-H1 özet, kazanma oranı, aşama dağılımı ve kayıp nedenleri yapılan işlemleri yansıtır", async ({ page, api }) => {
    const before = await insights(api);
    // Bir lead kazanılır, biri nedeniyle kaybedilir, biri yeni açılır.
    const kitchen = (await api.get("/leads/l-kitchen")).lead;
    expect((await api.patch("/leads/l-kitchen", { stageId: "s-won", expectedStageId: kitchen.stageId })).status).toBe(200);
    const desks = (await api.get("/leads/l-desks")).lead;
    expect((await api.patch("/leads/l-desks", { stageId: "s-lost", expectedStageId: desks.stageId, lossReasonId: "lr-price" })).status).toBe(200);
    expect((await api.post("/leads", { name: "Rapor için yeni lead", priceMinor: 100_000 })).status).toBe(201);

    await gotoInsights(page);
    await expect(tile(page, i.created)).toContainText(String(before.totals.created + 1));
    await expect(tile(page, i.won)).toContainText(String(before.totals.won + 1));
    await expect(tile(page, i.lost)).toContainText(String(before.totals.lost + 1));
    // İki lead kapandı, biri açıldı.
    await expect(tile(page, i.open)).toContainText(String(before.totals.open - 1));
    await expect(tile(page, i.open)).toContainText(i.openNow);
    // Kazanılan tutar: önceki + mutfağın tutarı (64.000).
    await expect(tile(page, i.won)).toContainText(new Intl.NumberFormat("tr-TR").format((before.totals.wonMinor + kitchen.priceMinor) / 100));

    const won = before.totals.won + 1;
    const closed = won + before.totals.lost + 1;
    const rate = Math.round((won / closed) * 100);
    const meter = card(page, i.winRate).getByRole("meter");
    await expect(meter).toHaveAttribute("aria-valuenow", String(rate));
    await expect(card(page, i.winRate)).toContainText(`%${rate}`);
    await expect(card(page, i.winRate)).toContainText(fill(i.winRateDetail, { won, closed }));

    await expect(card(page, i.lossTitle).getByRole("listitem").filter({ hasText: "Fiyat yüksek geldi" })).toContainText(fill(i.leadCount, { count: 1 }));
    // Yeni lead ilk açık aşamaya düştü; aşama satırı sayıyı ve tutarı gösterir.
    const after = await insights(api);
    const first = after.stages.find((stage) => stage.name === "İlk temas")!;
    await expect(card(page, i.stagesTitle).getByRole("listitem").filter({ hasText: "İlk temas" })).toContainText(fill(i.leadCount, { count: first.count }));

    // Kişilere göre: kazanılan şimdiki sorumlusuna (Ada), kaybedilen Bora'ya yazılır.
    const users = card(page, i.usersTitle);
    const ada = after.users.find((user) => user.id === "u-ada")!;
    expect(ada.won).toBe((before.users.find((user) => user.id === "u-ada")?.won ?? 0) + 1);
    await expect(users.getByRole("row", { name: /Ada Yıldız/ })).toContainText(new Intl.NumberFormat("tr-TR").format(ada.wonMinor / 100));
    expect(after.users.find((user) => user.id === "u-bora")!.lost).toBe((before.users.find((user) => user.id === "u-bora")?.lost ?? 0) + 1);

    // Son etkinlikler lead kartına götürür.
    await card(page, i.eventsTitle).getByRole("link", { name: "Rapor için yeni lead" }).first().click();
    await expect(page.getByRole("heading", { name: "Rapor için yeni lead", level: 1 })).toBeVisible();
  });

  test("F20-H2 dönem ve sorumlu süzgeci bütün sayıları birlikte değiştirir", async ({ page, api }) => {
    const week = await insights(api, "?days=7");
    const longest = await insights(api, "?days=65");
    expect(week.daily).toHaveLength(7);
    expect(longest.daily).toHaveLength(65);
    expect(longest.totals.created).toBeGreaterThanOrEqual(week.totals.created);
    // Günlük seri, dönemin toplamıyla tutarlıdır.
    expect(longest.daily.reduce((sum, point) => sum + point.created, 0)).toBe(longest.totals.created);

    await gotoInsights(page);
    await choose(page, i.range, i.ranges[7]);
    await expect(tile(page, i.created)).toContainText(String(week.totals.created));
    await card(page, i.dailyTitle).getByText(i.dailyTable).click();
    await expect(card(page, i.dailyTitle).getByRole("row")).toHaveCount(8);

    const bora = await insights(api, `?days=7&responsible=${u("u-bora")}`);
    await choose(page, i.responsible, "Bora Şahin");
    await expect(tile(page, i.open)).toContainText(String(bora.totals.open));
    await expect(tile(page, i.created)).toContainText(String(bora.totals.created));
    expect(bora.totals.open).toBeLessThan(week.totals.open);

    // Hiç lead'i olmayan biri seçilince kutular sıfır gösterir; "veri yok" ekranı çıkmaz.
    await choose(page, i.responsible, "Cem Kara");
    await expect(tile(page, i.open)).toContainText("0");
    await expect(card(page, i.stagesTitle)).toContainText(i.stagesNone);
    await expect(page.getByText(i.emptyTitle)).toHaveCount(0);
  });

  test("F20-E1 grafik bir özet cümlesiyle okunur, aynı veri tabloda vardır; ekran erişilebilir ve dar ekranda taşmaz", async ({ page, api }) => {
    const data = await insights(api);
    await gotoInsights(page);
    const chart = card(page, i.dailyTitle).getByRole("img");
    await expect(chart).toHaveAttribute("aria-label", new RegExp(`${data.totals.created} yeni lead`));
    await expectNoA11yViolations(page);
    await card(page, i.dailyTitle).getByText(i.dailyTable).click();
    const peak = data.daily.reduce((best, point) => (point.created > best.created ? point : best));
    const day = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${peak.day}T00:00:00Z`));
    await expect(card(page, i.dailyTitle).getByRole("row", { name: new RegExp(`^${day}`) })).toContainText(String(peak.created));
    await expectNoA11yViolations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
  });

  test("F20-N1 kısıtlı üye yalnız görebildiği lead'lerin raporunu görür", async ({ page, api }) => {
    const all = await insights(api);
    await actAs(page, "u-cem");
    const mine = await insights(api);
    // Cem yalnız sahipsiz talebi görür: bir açık lead, kazanılan yok.
    expect(mine.totals).toMatchObject({ open: 1, won: 0, wonMinor: 0, lost: 0 });
    expect(mine.totals.created).toBeLessThan(all.totals.created);
    expect(mine.users.every((user) => user.won === 0 && user.wonMinor === 0)).toBe(true);
    expect(mine.events.every((event) => event.leadName === "Telegram talebi")).toBe(true);
    await gotoInsights(page);
    await expect(tile(page, i.open)).toContainText("1");
    await expect(page.getByText("Mutfak yenileme")).toHaveCount(0);
  });

  test("F20-N2 geçersiz dönem varsayılana döner; geçersiz sorumlu boş rapor verir; başka kiracı karışmaz", async ({ api }) => {
    expect((await insights(api, "?days=9999")).range.days).toBe(30);
    expect((await insights(api, "?days=abc")).range.days).toBe(30);
    const bogus = await insights(api, "?responsible=x%27%20or%201%3D1");
    expect(bogus.totals).toMatchObject({ created: 0, open: 0, won: 0, lost: 0 });
    const other = await insights(api, `?responsible=${u("u-can")}`);
    expect(other.totals).toMatchObject({ created: 0, open: 0 });
    expect((await insights(api, "?days=65")).events.every((event) => event.leadName !== "Gizli teklif")).toBe(true);
  });
});
