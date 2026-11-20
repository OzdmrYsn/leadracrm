import { actAs, card, column, expect, expectNoA11yViolations, fill, gotoBoard, STAGE, t, test, WS } from "./support";
import type { Page } from "@playwright/test";

// Abonelik ve koltuk, yerel ödeme taklidine karşı sınanır: kart sorulmaz, para çekilmez, gerçek sağlayıcıya istek gitmez.
const b = t.billing;
const billingPage = `/w/${WS}/settings/billing`;
const SEAT = 49_900; // geçici koltuk fiyatı (kuruş); BILLING_SEAT_MONTHLY_MINOR verilmediğinde kullanılır
const money = (minor: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(minor / 100);

type Subscription = { state: string; readOnly: boolean; seats: number; seatsUsed: number; period: string | null; cancelAtPeriodEnd: boolean };
const subscription = async (page: Page) => ((await (await page.request.get(`/api/w/${WS}/session`)).json()) as { subscription: Subscription }).subscription;
const control = async (page: Page, data: Record<string, unknown>) => (await (await page.request.post("/api/dev/billing/control", { data: { ws: WS, ...data } })).json()) as { status?: number };
const post = (page: Page, path: string, data?: unknown) => page.request.post(`/api/w/${WS}${path}`, data === undefined ? undefined : { data });
const code = async (response: { json: () => Promise<unknown> }) => ((await response.json()) as { error: { code: string } }).error.code;

/** Ödeme sayfasını arayüzsüz geçer: ödeme oturumu açılır ve taklitte ödenir (ya da reddedilir). */
async function subscribe(page: Page, seats: number, period: "month" | "year" = "month", paid = true) {
  const checkout = await post(page, "/billing/checkout", { seats, period });
  expect(checkout.status(), "checkout").toBe(200);
  const sessionId = ((await checkout.json()) as { url: string }).url.split("/").pop()!;
  const settled = await page.request.post("/api/dev/billing/settle", { data: { sessionId, paid } });
  return ((await settled.json()) as { returnUrl: string }).returnUrl;
}

test.describe("F25 abonelik ve koltuk (yerel ödeme taklidiyle)", () => {
  test("F25-H1 denemedeki yönetici koltuk ve dönem seçer, öder; abonelik etkin olur ve fatura listelenir", async ({ page }) => {
    await page.goto(billingPage);
    await expect(page.getByText(b.states.trialing, { exact: true })).toBeVisible();
    await expect(page.getByText(/Denemenizin bitmesine 14 gün kaldı/)).toBeVisible();
    await expect(page.getByText(fill(b.seatsUsed, { used: 3, seats: 10 }))).toBeVisible();
    await expect(page.getByText(b.noInvoices)).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByLabel(new RegExp(`^${b.seats}`)).fill("4");
    await expect(page.getByText(fill(b.totalMonth, { total: money(SEAT * 4) }))).toBeVisible();
    await page.getByRole("radio", { name: new RegExp(`^${b.periods.year}`) }).check();
    // Yıllıkta 10 ay ücreti alınır.
    await expect(page.getByText(fill(b.totalYear, { total: money(SEAT * 4 * 10) }))).toBeVisible();
    await expect(page.getByText(b.provisional)).toBeVisible();
    await page.getByRole("button", { name: b.goToPayment }).click();

    // Ödeme taklidinin sayfası.
    await expect(page).toHaveURL(/\/dev\/checkout\//);
    await expect(page.getByRole("heading", { name: b.dev.title })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: fill(b.dev.pay, { amount: money(SEAT * 4 * 10) }) }).click();

    await expect(page.getByText(b.paid)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${billingPage}$`));
    await expect(page.getByText(b.states.active, { exact: true })).toBeVisible();
    await expect(page.getByText(fill(b.seatsUsed, { used: 3, seats: 4 }))).toBeVisible();
    const invoices = page.getByRole("region", { name: b.invoices });
    await expect(invoices.getByRole("row").filter({ hasText: fill(b.invoiceDetail, { seats: 4, period: b.periods.year }) })).toContainText(b.invoiceStatus.paid);
    await expectNoA11yViolations(page);
    expect(await subscription(page)).toMatchObject({ state: "active", readOnly: false, seats: 4, seatsUsed: 3, period: "year", cancelAtPeriodEnd: false });
  });

  test("F25-H2 etkin abonelikte koltuk sayısı değişir; tek tıkla iptal edilir ve iptal geri alınır", async ({ page }) => {
    await subscribe(page, 3);
    await page.goto(billingPage);
    const seats = page.getByLabel(new RegExp(`^${b.seats}`));
    await expect(seats).toHaveValue("3");
    await expect(page.getByRole("button", { name: b.updateSeats })).toBeDisabled();
    await seats.fill("5");
    await page.getByRole("button", { name: b.updateSeats }).click();
    await expect(page.getByText(fill(b.seatsSaved, { count: 5 }))).toBeVisible();
    expect((await subscription(page)).seats).toBe(5);

    await page.getByRole("button", { name: b.cancel }).click();
    const dialog = page.getByRole("dialog", { name: b.cancelTitle });
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: b.cancelConfirm }).click();
    await expect(page.getByText(/Abonelik iptal edildi: .+ tarihine kadar kullanabilirsiniz\./).first()).toBeVisible();
    // İptal dönem sonunda geçerli olur: o güne kadar abonelik etkindir.
    expect(await subscription(page)).toMatchObject({ state: "active", readOnly: false, cancelAtPeriodEnd: true });

    await page.getByRole("button", { name: b.resume }).click();
    await expect(page.getByText(b.resumed)).toBeVisible();
    expect((await subscription(page)).cancelAtPeriodEnd).toBe(false);
    await expect(page.getByRole("button", { name: b.cancel })).toBeVisible();
  });

  test("F25-H3 deneme bitmek üzereyken her ekranda uyarı çıkar ve abonelik ekranına götürür", async ({ page }) => {
    await gotoBoard(page);
    await expect(page.getByText(/Denemenizin bitmesine/)).toHaveCount(0);
    await control(page, { action: "shift", trialEndsInDays: 3 });
    await page.reload();
    const banner = page.getByRole("status").filter({ hasText: fill(b.banner.trial, { days: 3 }) });
    await expect(banner).toBeVisible();
    await expectNoA11yViolations(page);
    await banner.getByRole("link", { name: b.banner.subscribe }).click();
    await expect(page).toHaveURL(new RegExp(`${billingPage}$`));
  });

  test.describe("kurallar", () => {
    test.use({ allow4xx: [401, 402, 403, 409, 422] });

    test("F25-E1 koltuk sayısı etkin kullanıcı sayısından az ya da geçersiz olamaz", async ({ page }) => {
      await page.goto(billingPage);
      const seats = page.getByLabel(new RegExp(`^${b.seats}`));
      await seats.fill("2");
      await page.getByRole("button", { name: b.goToPayment }).click();
      await expect(page.getByText(fill(b.seatsBelow, { count: 3 }))).toBeVisible();
      await expect(seats).toHaveAttribute("aria-invalid", "true");
      await seats.fill("çok");
      await expect(page.getByText(b.seatsInvalid)).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${billingPage}$`));

      const low = await post(page, "/billing/checkout", { seats: 2, period: "month" });
      expect([low.status(), await code(low)]).toEqual([422, "seats_below_members"]);
      expect((await post(page, "/billing/checkout", { seats: 501, period: "month" })).status()).toBe(422);
      expect((await post(page, "/billing/checkout", { seats: 3, period: "hafta" })).status()).toBe(422);
      // Abonelik yokken koltuk değiştirilemez, iptal edilemez.
      expect([(await post(page, "/billing/seats", { seats: 4 })).status(), (await post(page, "/billing/cancel")).status()]).toEqual([409, 409]);
      // Etkinken yeniden ödeme başlatılamaz; koltuk etkin kullanıcıdan aşağı inemez.
      await subscribe(page, 4);
      expect(await code(await post(page, "/billing/checkout", { seats: 5, period: "month" }))).toBe("already_subscribed");
      expect(await code(await post(page, "/billing/seats", { seats: 2 }))).toBe("seats_below_members");
      expect((await subscription(page)).seats).toBe(4);
    });

    test("F25-E2 bütün koltuklar doluyken pasif kullanıcı etkinleştirilemez; koltuk eklenince etkinleşir", async ({ page }) => {
      await subscribe(page, 3);
      const member = (userId: string, isActive: boolean) => page.request.patch(`/api/w/${WS}/members/${userId}`, { data: { isActive } });
      const bora = "c4a1a7a5-0000-4000-8000-000000000000"; // yer tutucu; aşağıda oturumdan okunur
      const users = ((await (await page.request.get(`/api/w/${WS}/members`)).json()) as Array<{ id: string; name: string }>).filter((user) => user.name === "Bora Şahin");
      const boraId = users[0]?.id ?? bora;
      expect((await member(boraId, false)).status()).toBe(200);
      expect((await post(page, "/billing/seats", { seats: 2 })).status()).toBe(204);
      const blocked = await member(boraId, true);
      expect([blocked.status(), await code(blocked)]).toEqual([409, "seat_limit"]);

      await page.goto(`/w/${WS}/settings/users`);
      await expect(page.getByText(fill(b.seatLine, { used: 2, seats: 2 }))).toBeVisible();
      await page.getByRole("link", { name: b.seatLink }).click();
      await expect(page).toHaveURL(new RegExp(`${billingPage}$`));

      expect((await post(page, "/billing/seats", { seats: 3 })).status()).toBe(204);
      expect((await member(boraId, true)).status()).toBe(200);
      expect(await subscription(page)).toMatchObject({ seats: 3, seatsUsed: 3 });
    });

    test("F25-E3 deneme bitince çalışma alanı salt okunur olur: veri okunur ve dışa aktarılır, gelen talepler kaydedilir; abone olunca açılır", async ({ page }) => {
      await control(page, { action: "shift", trialEndsInDays: -1 });
      expect(await subscription(page)).toMatchObject({ state: "expired", readOnly: true });

      await gotoBoard(page);
      const banner = page.getByRole("status").filter({ hasText: b.banner.readOnly });
      await expect(banner).toBeVisible();
      await expect(card(column(page, STAGE.talk), "Mutfak yenileme")).toBeVisible();
      await expectNoA11yViolations(page);

      // Yazma her uçta reddedilir; okuma ve dışa aktarma çalışır.
      const blocked = await post(page, "/leads", { name: "Yazılamaz", priceMinor: 0 });
      expect([blocked.status(), await code(blocked)]).toEqual([402, "subscription_required"]);
      expect((await page.request.patch(`/api/w/${WS}/workspace`, { data: { name: "Değişmez" } })).status()).toBe(402);
      expect((await page.request.get(`/api/w/${WS}/leads?status=all`)).status()).toBe(200);
      const exported = await page.request.get(`/api/w/${WS}/leads/export`);
      expect(exported.status()).toBe(200);
      expect(await exported.text()).toContain("Mutfak yenileme");
      // Kanaldan gelen talep kaybolmaz.
      expect((await page.request.post("/api/dev/simulate-inbound", { data: { ws: WS, contactName: "Geç Gelen", text: "Hâlâ orada mısınız?" } })).status()).toBe(201);

      // Arayüzde: lead eklemek istenirse neden söylenir.
      await page.getByRole("banner").getByRole("button", { name: t.board.addLead }).click();
      const dialog = page.getByRole("dialog", { name: t.newLead.title });
      await dialog.getByLabel(t.newLead.name).fill("Yazılamaz");
      await dialog.getByRole("button", { name: t.newLead.submit }).click();
      await expect(dialog.getByText(t.errors.subscription_required)).toBeVisible();
      await page.keyboard.press("Escape");

      // Abonelik salt okunur kipte de başlatılabilir; sonrasında yazma açılır.
      await banner.getByRole("link", { name: b.banner.subscribe }).click();
      await expect(page.getByText(b.states.expired, { exact: true })).toBeVisible();
      await subscribe(page, 3);
      expect(await subscription(page)).toMatchObject({ state: "active", readOnly: false });
      expect((await post(page, "/leads", { name: "Artık yazılır", priceMinor: 0 })).status()).toBe(201);
      await gotoBoard(page);
      await expect(page.getByRole("status").filter({ hasText: b.banner.readOnly })).toHaveCount(0);
      await expect(card(column(page, STAGE.incoming), "Telegram talebi").filter({ hasText: "Geç Gelen" })).toBeVisible();
    });

    test("F25-E4 reddedilen ödeme aboneliği değiştirmez; alınamayan ödemede ek süre işler, süre dolunca salt okunur olur; sona eren abonelik yeniden başlatılır", async ({ page }) => {
      const returnUrl = await subscribe(page, 3, "month", false);
      await page.goto(returnUrl);
      await expect(page.getByText(b.notPaid)).toBeVisible();
      await expect(page.getByText(b.states.trialing, { exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: b.invoices }).getByText(b.invoiceStatus.failed)).toBeVisible();
      expect((await subscription(page)).state).toBe("trialing");

      await subscribe(page, 3);
      expect((await control(page, { action: "fail-payment" })).status).toBe(200);
      expect(await subscription(page)).toMatchObject({ state: "past_due", readOnly: false });
      await gotoBoard(page);
      await expect(page.getByRole("status").filter({ hasText: b.banner.pastDue })).toBeVisible();
      expect((await post(page, "/leads", { name: "Ek sürede yazılır", priceMinor: 0 })).status()).toBe(201);

      // Dönem sonu 8 gün geride: yedi günlük ek süre bitmiştir.
      await control(page, { action: "shift", periodEndsInDays: -8 });
      expect(await subscription(page)).toMatchObject({ state: "expired", readOnly: true });
      await subscribe(page, 3);
      expect((await subscription(page)).state).toBe("active");

      // Sağlayıcı aboneliğin bittiğini bildirir.
      expect((await control(page, { action: "end" })).status).toBe(200);
      expect(await subscription(page)).toMatchObject({ state: "canceled", readOnly: true });
      await page.goto(billingPage);
      await expect(page.getByText(b.states.canceled, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: b.goToPayment })).toBeEnabled();
    });

    test("F25-N1 üye aboneliği değiştiremez; sahte imzalı bildirim reddedilir; aynı bildirim iki kez uygulanmaz", async ({ page }) => {
      await subscribe(page, 4);
      expect((await post(page, "/billing/seats", { seats: 6 })).status()).toBe(204);
      // İlk bildirim (4 koltuk) yeniden gelirse uygulanmaz: koltuk 6 kalır.
      expect((await control(page, { action: "replay", index: 0 })).status).toBe(200);
      expect((await subscription(page)).seats).toBe(6);
      // İmzası tutmayan bildirim.
      expect((await control(page, { action: "forge" })).status).toBe(401);
      expect(await subscription(page)).toMatchObject({ seats: 6, period: "month" });
      expect((await page.request.post("/api/hooks/billing", { data: { id: "x", type: "subscription.canceled", workspaceId: "x" } })).status()).toBe(401);

      await actAs(page, "u-bora");
      expect((await page.request.get(`/api/w/${WS}/billing`)).status()).toBe(403);
      expect((await post(page, "/billing/seats", { seats: 9 })).status()).toBe(403);
      expect((await post(page, "/billing/cancel")).status()).toBe(403);
      await page.goto(billingPage);
      await expect(page.getByText(b.adminOnly)).toBeVisible();
      await expect(page.getByText(b.states.active, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: b.cancel })).toHaveCount(0);

      // Salt okunur kipte üyeye yöneticisine haber vermesi söylenir.
      await actAs(page, null);
      await control(page, { action: "end" });
      await actAs(page, "u-bora");
      await gotoBoard(page);
      const banner = page.getByRole("status").filter({ hasText: b.banner.readOnly });
      await expect(banner).toContainText(b.banner.askAdmin);
      await expect(banner.getByRole("link")).toHaveCount(0);
      await actAs(page, null);
      expect((await subscription(page)).seats).toBe(6);
    });
  });
});
