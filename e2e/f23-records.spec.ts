import { choose, expect, expectNoHorizontalOverflow, fill, gotoLead, t, test, u, WS } from "./support";
import type { Page } from "@playwright/test";

const rows = (page: Page) => page.getByRole("row").filter({ has: page.getByRole("rowheader") });
const details = (page: Page) => page.getByRole("region", { name: t.contacts.details });

async function gotoContacts(page: Page) {
  await page.goto(`/w/${WS}/contacts`);
  await expect(page.getByRole("table")).toBeVisible();
}

async function gotoContact(page: Page, id: string) {
  await page.goto(u(`/w/${WS}/contacts/${id}`));
  await expect(details(page)).toBeVisible();
}

// Kişi ve şirket yönetimi keşif haritasında numaralı bir akış değildir; S23–S25 ekranlarından türetildi.
test.describe("F23 kişi ve şirket kaydını yönet", () => {
  test("F23-H1 telefon, e-posta ve yeni şirketle kişi eklenir; listede ve kartında görünür", async ({ page, api }) => {
    await gotoContacts(page);
    await page.getByRole("button", { name: t.contacts.add }).click();
    const dialog = page.getByRole("dialog", { name: t.contacts.newTitle });
    await dialog.getByLabel(t.contacts.name).fill("İrem Çalışkan");
    await dialog.getByLabel(t.contacts.phone).fill("+90 555 222 33 44");
    await dialog.getByLabel(t.contacts.email).fill("IREM@Caliskan.TEST");
    await dialog.getByRole("button", { name: t.company.link }).click();
    await page.getByRole("searchbox", { name: t.company.searchLabel }).fill("Çalışkan Tasarım");
    await page.getByRole("button", { name: fill(t.company.create, { name: "Çalışkan Tasarım" }) }).click();
    await expect(dialog.getByText("Çalışkan Tasarım")).toBeVisible();
    await dialog.getByRole("button", { name: t.contacts.submit }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: t.contacts.add })).toBeFocused();

    const row = rows(page).filter({ hasText: "İrem Çalışkan" });
    await expect(row).toContainText("Çalışkan Tasarım");
    await expect(row).toContainText("+90 555 222 33 44");
    // E-posta küçük harfe çevrilerek saklanır.
    await expect(row).toContainText("irem@caliskan.test");
    // Türkçe sıralama: İ, E ile M arasında.
    expect(await page.getByRole("rowheader").allTextContents()).toEqual([
      "Deniz Arslan", "Elif Kaya", "İrem Çalışkan", "Mert Demir", "Okan Tunç", "Selin Aksoy",
    ]);

    await row.getByRole("link", { name: "İrem Çalışkan" }).click();
    await expect(page.getByRole("heading", { name: "İrem Çalışkan", level: 1 })).toBeVisible();
    await expect(details(page).getByRole("link", { name: "+90 555 222 33 44" })).toHaveAttribute("href", "tel:+905552223344");
    await expect(details(page).getByRole("link", { name: "Çalışkan Tasarım" })).toBeVisible();
    const companies = (await api.get(`/companies?q=${encodeURIComponent("Çalışkan")}`)) as Array<{ contactCount: number }>;
    expect(companies).toHaveLength(1);
    expect(companies[0].contactCount).toBe(1);
  });

  test("F23-H2 kişi kartı: ad, sorumlu, telefon ekleme, e-posta kaldırma, şirket değiştirme ve ayırma", async ({ page, api }) => {
    await gotoContact(page, "c-deniz");
    const panel = details(page);

    await panel.getByRole("button", { name: new RegExp(`^${t.contacts.name} `) }).click();
    await panel.getByLabel(t.contacts.name).fill("Deniz Arslan Yılmaz");
    await panel.getByLabel(t.contacts.name).press("Enter");
    await expect(page.getByRole("heading", { name: "Deniz Arslan Yılmaz", level: 1 })).toBeVisible();

    await choose(page, t.lead.responsible, "Bora Şahin");
    await expect(panel.getByRole("combobox", { name: t.lead.responsible })).toHaveText("Bora Şahin");

    await panel.getByRole("button", { name: t.contacts.addPhone }).click();
    await panel.getByLabel(t.contacts.newPhone).fill("+90 212 555 00 11");
    await panel.getByLabel(t.contacts.newPhone).press("Enter");
    await expect(panel.getByRole("link", { name: "+90 212 555 00 11" })).toBeVisible();

    await panel.getByRole("button", { name: fill(t.contacts.removeHandle, { value: "deniz@kuzeymobilya.test" }) }).click();
    await expect(panel.getByText("deniz@kuzeymobilya.test")).toHaveCount(0);

    await panel.getByRole("button", { name: t.company.change }).click();
    await page.getByRole("searchbox", { name: t.company.searchLabel }).fill("aksoy");
    await page.getByRole("button", { name: /Aksoy Mimarlık/ }).click();
    await expect(panel.getByRole("link", { name: "Aksoy Mimarlık" })).toBeVisible();
    await panel.getByRole("button", { name: fill(t.company.unlinkLabel, { name: "Aksoy Mimarlık" }) }).click();
    await expect(panel.getByText(t.company.none)).toBeVisible();

    const detail = await api.get("/contacts/c-deniz");
    expect(detail.contact).toMatchObject({ name: "Deniz Arslan Yılmaz", responsibleUserId: "u-bora", companyId: null });
    expect(detail.contact.handles).toEqual([
      { kind: "whatsapp", value: "+90 555 010 20 30" },
      { kind: "phone", value: "+90 212 555 00 11" },
    ]);
    // Ayırmak şirketi silmez.
    expect(((await api.get("/companies")) as unknown[]).length).toBe(2);
  });

  test("F23-H3 şirket eklenince kartı açılır; ad değişir, bağlı kişi ve lead'ler listelenir", async ({ page }) => {
    await page.goto(`/w/${WS}/companies`);
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: t.companies.add }).click();
    const dialog = page.getByRole("dialog", { name: t.companies.newTitle });
    await dialog.getByLabel(t.companies.name).fill("Ege Yapı");
    await dialog.getByLabel(t.companies.name).press("Enter");
    await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Ege Yapı", level: 1 })).toBeVisible();
    await expect(page.getByText(t.companies.noContacts)).toBeVisible();
    await expect(page.getByText(t.companies.noLeads)).toBeVisible();

    await page.goto(u(`/w/${WS}/companies/co-kuzey`));
    const related = page.getByRole("region", { name: t.companies.related });
    await expect(related.getByRole("link", { name: "Deniz Arslan" })).toBeVisible();
    await expect(related.getByRole("link", { name: "Mutfak yenileme" })).toBeVisible();
    const panel = page.getByRole("region", { name: t.companies.details });
    await panel.getByRole("button", { name: new RegExp(`^${t.companies.name} `) }).click();
    await panel.getByLabel(t.companies.name).fill("Kuzey Mobilya A.Ş.");
    await panel.getByLabel(t.companies.name).press("Enter");
    await expect(page.getByRole("heading", { name: "Kuzey Mobilya A.Ş.", level: 1 })).toBeVisible();

    await page.goto(`/w/${WS}/companies`);
    const row = rows(page).filter({ hasText: "Kuzey Mobilya A.Ş." });
    await expect(row.getByRole("cell").nth(0)).toHaveText("1");
    await expect(row.getByRole("cell").nth(1)).toHaveText("1");
  });

  test("F23-H4 lead kartında kişi değiştirilir, ayrılır; şirket bağlanır ve ayrılır", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const panel = page.getByRole("region", { name: t.lead.details });
    await panel.getByRole("button", { name: t.contact.change }).first().click();
    await page.getByRole("searchbox", { name: t.contact.searchLabel }).fill("selin");
    await page.getByRole("button", { name: /Selin Aksoy/ }).click();
    await expect(panel.getByRole("link", { name: "Selin Aksoy" })).toBeVisible();
    expect((await api.get("/leads/l-kitchen")).lead.contactId).toBe("c-selin");

    await panel.getByRole("button", { name: fill(t.contact.unlinkLabel, { name: "Selin Aksoy" }) }).click();
    await expect(panel.getByText(t.lead.noContact)).toBeVisible();
    // Ayırmak kişiyi silmez.
    expect((await api.get("/contacts/c-selin")).contact.name).toBe("Selin Aksoy");

    await panel.getByRole("button", { name: fill(t.company.unlinkLabel, { name: "Kuzey Mobilya" }) }).click();
    await expect(panel.getByText(t.company.none)).toBeVisible();
    await panel.getByRole("button", { name: t.company.link }).click();
    await page.getByRole("searchbox", { name: t.company.searchLabel }).fill("KUZEY");
    await page.getByRole("button", { name: /Kuzey Mobilya/ }).click();
    await expect(panel.getByRole("link", { name: "Kuzey Mobilya" })).toBeVisible();
    expect((await api.get("/leads/l-kitchen")).lead.companyId).toBe("co-kuzey");
  });

  test("F23-E2 liste: şirket adından arama, lead sayısına göre sıralama, sorumlu süzgeci, boş sonuç", async ({ page }) => {
    await gotoContacts(page);
    await expect(rows(page)).toHaveCount(5);
    const search = page.getByRole("searchbox", { name: t.contacts.searchLabel });
    await search.fill("AKSOY MİMARLIK");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Selin Aksoy");
    await search.fill("555 070");
    await expect(rows(page).first()).toContainText("Okan Tunç");
    await search.fill("yok böyle biri");
    await expect(page.getByText(fill(t.contacts.noResultsBody, { query: "yok böyle biri" }))).toBeVisible();
    await page.getByRole("button", { name: t.filter.clear }).click();
    await expect(rows(page)).toHaveCount(5);

    const leads = page.getByRole("columnheader", { name: t.contacts.colLeads });
    await leads.getByRole("button").click();
    await leads.getByRole("button").click();
    await expect(leads).toHaveAttribute("aria-sort", "descending");
    await expect(rows(page).first()).toContainText("Mert Demir");

    await page.getByRole("combobox", { name: t.common.responsibleFilter }).click();
    await page.getByRole("option", { name: "Bora Şahin" }).click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByRole("combobox", { name: t.common.responsibleFilter }).click();
    await page.getByRole("option", { name: t.common.unassigned }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Elif Kaya");
  });

  test("F23-E6 kanal kimliği (WhatsApp, Telegram) kişi kartından kaldırılamaz", async ({ page }) => {
    await gotoContact(page, "c-deniz");
    const panel = details(page);
    await expect(panel.getByText("WhatsApp: +90 555 010 20 30")).toBeVisible();
    await expect(panel.getByRole("button", { name: fill(t.contacts.removeHandle, { value: "+90 555 010 20 30" }) })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: fill(t.contacts.removeHandle, { value: "deniz@kuzeymobilya.test" }) })).toBeVisible();
  });

  test("F23-E7 boş ad kaydedilmez; Esc düzenlemeyi geri alır", async ({ page, api }) => {
    await gotoContact(page, "c-deniz");
    const panel = details(page);
    await panel.getByRole("button", { name: new RegExp(`^${t.contacts.name} `) }).click();
    await panel.getByLabel(t.contacts.name).fill("   ");
    await panel.getByLabel(t.contacts.name).press("Enter");
    await expect(panel.getByText(t.contacts.nameRequired)).toBeVisible();
    await panel.getByLabel(t.contacts.name).press("Escape");
    await expect(panel.getByRole("button", { name: new RegExp(`^${t.contacts.name} Deniz Arslan `) })).toBeVisible();
    expect((await api.get("/contacts/c-deniz")).contact.name).toBe("Deniz Arslan");
  });

  test("F23-E5 çok uzun ve emojili ad liste ve kartı taşırmaz", async ({ page, api }) => {
    const name = `Uzun adlı kişi 🧑‍🔧 ${"Çokuzunsoyadıboşluksuz".repeat(9)}`.slice(0, 255);
    const created = await api.post("/contacts", { name });
    expect(created.status).toBe(201);
    await gotoContacts(page);
    await expectNoHorizontalOverflow(page);
    await gotoContact(page, created.body.id);
    await expectNoHorizontalOverflow(page);
    const panel = details(page);
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });

  test.describe("geçersiz girdiler", () => {
    test.use({ allow4xx: [404, 422] });

    test("F23-E1 geçersiz e-posta ve telefon alanın altında hata verir; düzeltilince hata kalkar", async ({ page, api }) => {
      await gotoContacts(page);
      await page.getByRole("button", { name: t.contacts.add }).click();
      const dialog = page.getByRole("dialog", { name: t.contacts.newTitle });
      await dialog.getByLabel(t.contacts.name).fill("Hatalı Kayıt");
      await dialog.getByLabel(t.contacts.email).fill("hatali@");
      await dialog.getByRole("button", { name: t.contacts.submit }).click();
      await expect(dialog.getByText(t.errors.invalid_email)).toBeVisible();
      await dialog.getByLabel(t.contacts.email).fill("dogru@ornek.test");
      await expect(dialog.getByText(t.errors.invalid_email)).toHaveCount(0);
      await dialog.getByLabel(t.contacts.phone).fill("abc");
      await dialog.getByRole("button", { name: t.contacts.submit }).click();
      await expect(dialog.getByText(t.errors.invalid_phone)).toBeVisible();
      expect(((await api.get(`/contacts?q=${encodeURIComponent("Hatalı")}`)) as unknown[]).length).toBe(0);

      await page.keyboard.press("Escape");
      await gotoContact(page, "c-deniz");
      await details(page).getByRole("button", { name: t.contacts.addEmail }).click();
      await details(page).getByLabel(t.contacts.newEmail).fill("bozuk-eposta");
      await details(page).getByLabel(t.contacts.newEmail).press("Enter");
      await expect(details(page).getByText(t.errors.invalid_email)).toBeVisible();
      await details(page).getByLabel(t.contacts.newEmail).fill("deniz.yeni@ornek.test");
      await expect(details(page).getByText(t.errors.invalid_email)).toHaveCount(0);
      await details(page).getByLabel(t.contacts.newEmail).press("Enter");
      await expect(details(page).getByRole("link", { name: "deniz.yeni@ornek.test" })).toBeVisible();
    });

    test("F23-E3 olmayan kişi ve şirket: bulunamadı durumu ve listeye dönüş bağlantısı", async ({ page }) => {
      await page.goto(u(`/w/${WS}/contacts/c-yok`));
      await expect(page.getByText(t.common.notFound)).toBeVisible();
      await page.getByRole("link", { name: t.contacts.back }).last().click();
      await expect(page).toHaveURL(/\/contacts$/);
      await page.goto(u(`/w/${WS}/companies/co-yok`));
      await expect(page.getByText(t.common.notFound)).toBeVisible();
    });

    test("F23-N1 API: yinelenen iletişim bilgisi tekilleşir; olmayan şirket, 11 bilgi ve boş ad reddedilir", async ({ api }) => {
      const twice = await api.patch("/contacts/c-okan", {
        handles: [
          { kind: "whatsapp", value: "+90 555 070 80 90" },
          { kind: "email", value: "Okan@Ornek.test" },
          { kind: "email", value: "okan@ornek.test " },
        ],
      });
      expect(twice.status).toBe(200);
      expect(twice.body.handles).toHaveLength(2);
      expect((await api.patch("/contacts/c-okan", { companyId: "co-yok" })).status).toBe(404);
      const many = Array.from({ length: 11 }, (_, index) => ({ kind: "phone", value: `+90 555 000 00 ${String(index).padStart(2, "0")}` }));
      expect((await api.patch("/contacts/c-okan", { handles: many })).status).toBe(422);
      expect((await api.patch("/contacts/c-okan", { name: "  " })).status).toBe(422);
      expect((await api.post("/companies", { name: "" })).status).toBe(422);
      expect((await api.get("/contacts/c-okan")).contact.handles).toHaveLength(2);
    });
  });
});
