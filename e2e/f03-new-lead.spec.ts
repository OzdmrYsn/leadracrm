import { card, column, expect, expectNoHorizontalOverflow, feed, fill, gotoBoard, STAGE, t, test } from "./support";
import type { Page } from "@playwright/test";

const PRICE = fill(t.newLead.price, { currency: "TRY" });

async function openDialog(page: Page) {
  await gotoBoard(page);
  await page.getByRole("button", { name: t.board.addLead }).click();
  const dialog = page.getByRole("dialog", { name: t.newLead.title });
  await expect(dialog).toBeVisible();
  return dialog;
}

const leadsNamed = async (api: { get: (path: string) => Promise<Array<{ name: string }>> }, name: string) =>
  (await api.get("/leads?status=all")).filter((lead) => lead.name === name);

test.describe("F03 lead'i elle oluştur", () => {
  test("F03-H1 ad, tutar ve yeni kişiyle lead oluşturulur; ilk aşamada görünür ve kartı açılır", async ({ page, api }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill("Salon kitaplığı");
    await dialog.getByLabel(PRICE).fill("12.500,50");
    await dialog.getByRole("button", { name: t.contact.link }).click();
    await page.getByRole("searchbox", { name: t.contact.searchLabel }).fill("Canan Öztürk");
    await page.getByRole("button", { name: fill(t.contact.create, { name: "Canan Öztürk" }) }).click();
    await expect(dialog.getByText("Canan Öztürk")).toBeVisible();
    await dialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(dialog).toBeHidden();

    const created = card(column(page, STAGE.first), "Salon kitaplığı");
    await expect(created).toBeVisible();
    await expect(created).toContainText("Canan Öztürk");
    await expect(page.getByRole("button", { name: t.board.addLead })).toBeFocused();

    const [lead] = (await api.get("/leads?q=Salon")) as Array<{ id: string; priceMinor: number; responsible: { name: string }; contactName: string }>;
    expect(lead.priceMinor).toBe(1_250_050);
    expect(lead.responsible.name).toBe("Ada Yıldız");
    expect(lead.contactName).toBe("Canan Öztürk");

    await created.getByRole("link", { name: "Salon kitaplığı" }).click();
    await expect(page.getByRole("heading", { name: "Salon kitaplığı", level: 1 })).toBeVisible();
    await expect(feed(page).getByText(fill(t.event.created, { actor: "Ada Yıldız" }))).toBeVisible();
  });

  test("F03-N1 var olan kişi aranıp bağlanır; aynı adla ikinci kişi oluşmaz", async ({ page, api }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill("Banyo dolabı");
    await dialog.getByRole("button", { name: t.contact.link }).click();
    await page.getByRole("searchbox", { name: t.contact.searchLabel }).fill("deniz");
    await page.getByRole("button", { name: /Deniz Arslan/ }).click();
    await expect(dialog.getByText("Deniz Arslan")).toBeVisible();
    await dialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(dialog).toBeHidden();

    const contacts = (await api.get(`/contacts?q=${encodeURIComponent("Deniz Arslan")}`)) as Array<{ id: string; leadCount: number }>;
    expect(contacts.map((contact) => contact.id)).toEqual(["c-deniz"]);
    expect(contacts[0].leadCount).toBe(2);
    const [lead] = (await api.get("/leads?q=Banyo")) as Array<{ id: string; companyName: string }>;
    // Kişinin şirketi lead'e de taşınır.
    expect(lead.companyName).toBe("Kuzey Mobilya");
  });

  test("F03-E1 ad boşsa hata gösterilir ve lead oluşmaz", async ({ page, api }) => {
    const before = ((await api.get("/leads?status=all")) as unknown[]).length;
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill("   ");
    await dialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(dialog.getByText(t.newLead.nameRequired)).toBeVisible();
    await expect(dialog.getByLabel(t.newLead.name)).toHaveAttribute("aria-invalid", "true");
    await expect(dialog).toBeVisible();
    expect(((await api.get("/leads?status=all")) as unknown[]).length).toBe(before);
  });

  test("F03-E2 tutar sayı değilse ya da eksi ise hata gösterilir", async ({ page }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill("Tutar denemesi");
    for (const bad of ["abc", "-5", "12,5,3"]) {
      await dialog.getByLabel(PRICE).fill(bad);
      await dialog.getByRole("button", { name: t.newLead.submit }).click();
      await expect(dialog.getByText(t.newLead.priceInvalid), `tutar: ${bad}`).toBeVisible();
    }
    await dialog.getByLabel(PRICE).fill("1500");
    await dialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(dialog).toBeHidden();
    await expect(card(column(page, STAGE.first), "Tutar denemesi")).toContainText("₺1.500");
  });

  test("F03-E3 çok uzun, emojili ve aksanlı ad olduğu gibi saklanır; kart sütundan taşmaz", async ({ page, api }) => {
    const name = `Şömine çevresi 🔥 İstanbul'da ığdır işi oyma, çok uzun bir lead adı ${"uzun ".repeat(20)}`.trim();
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill(name);
    await dialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(dialog).toBeHidden();
    const first = column(page, STAGE.first);
    const created = card(first, name);
    await expect(created).toBeVisible();
    const box = await created.boundingBox();
    const columnBox = await first.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(columnBox!.width);
    expect((await leadsNamed(api, name)).length).toBe(1);
  });

  test("F03-E4 gönder düğmesine çift tıklamak tek lead oluşturur", async ({ page, api }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill("Çift tıklama");
    await dialog.getByRole("button", { name: t.newLead.submit }).dblclick();
    await expect(dialog).toBeHidden();
    await expect(card(column(page, STAGE.first), "Çift tıklama")).toHaveCount(1);
    expect((await leadsNamed(api, "Çift tıklama")).length).toBe(1);
  });

  test("F03-E5 Esc pencereyi kapatır, lead oluşmaz, odak düğmeye döner", async ({ page, api }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel(t.newLead.name).fill("Vazgeçilen");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: t.board.addLead })).toBeFocused();
    expect((await leadsNamed(api, "Vazgeçilen")).length).toBe(0);
  });

  test("F03-E6 yalnız klavyeyle: aç, yaz, Enter ile gönder", async ({ page, api }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: t.board.addLead }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: t.newLead.title });
    await expect(dialog.getByLabel(t.newLead.name)).toBeFocused();
    await page.keyboard.type("Klavyeyle eklenen");
    await page.keyboard.press("Tab");
    await page.keyboard.type("750");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    const [lead] = await leadsNamed(api, "Klavyeyle eklenen");
    expect(lead).toMatchObject({ priceMinor: 75_000 });
  });

  test.describe("API doğrulaması", () => {
    test.use({ allow4xx: [404, 422] });

    test("F03-E7 geçersiz girdiler reddedilir: 256 karakter ad, boş ad, eksi tutar, gelen talepler aşaması, olmayan kişi", async ({ api }) => {
      expect((await api.post("/leads", { name: "x".repeat(256) })).status).toBe(422);
      expect((await api.post("/leads", { name: "   " })).status).toBe(422);
      expect((await api.post("/leads", { name: "Eksi", priceMinor: -1 })).status).toBe(422);
      expect((await api.post("/leads", { name: "Kuruş", priceMinor: 10.5 })).status).toBe(422);
      const incoming = await api.post("/leads", { name: "Gelen", stageId: "s-in" });
      expect(incoming.status).toBe(422);
      expect(incoming.body.error.code).toBe("invalid_stage");
      expect((await api.post("/leads", { name: "Kişisiz", contactId: "c-yok" })).status).toBe(404);
      expect((await api.post("/leads", { name: "x".repeat(255) })).status).toBe(201);
    });
  });

  test.describe("telefon genişliği", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("F03-E8 390 pikselde pencere ekrana sığar ve lead oluşturulur", async ({ page }) => {
      const dialog = await openDialog(page);
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      await dialog.getByLabel(t.newLead.name).fill("Telefondan eklenen");
      const submit = dialog.getByRole("button", { name: t.newLead.submit });
      await submit.scrollIntoViewIfNeeded();
      await submit.click();
      await expect(dialog).toBeHidden();
      await expectNoHorizontalOverflow(page);
      await expect(card(page, "Telefondan eklenen")).toBeVisible();
    });
  });
});
