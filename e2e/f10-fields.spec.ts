import { choose, expect, fill, gotoLead, t, test } from "./support";
import type { Page } from "@playwright/test";

type Field = { id: string; name: string; type: string; options: Array<{ id: string; label: string }> };

const fieldsPanel = (page: Page) => page.getByRole("region", { name: t.fields.title });
const leadFields = (api: { get: (path: string) => Promise<unknown> }) => api.get("/fields?entity=lead") as Promise<Field[]>;
const customOf = async (api: { get: (path: string) => Promise<any> }, leadId = "l-kitchen") => (await api.get(`/leads/${leadId}`)).lead.custom as Record<string, unknown>;

async function openManage(page: Page) {
  await fieldsPanel(page).getByRole("button", { name: t.fields.manage }).click();
  const dialog = page.getByRole("dialog", { name: t.fields.manageTitle.lead });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function addField(page: Page, name: string, type: string, options?: string) {
  const dialog = await openManage(page);
  await dialog.getByLabel(t.fields.newName).fill(name);
  await dialog.getByRole("combobox", { name: t.fields.type }).click();
  await page.getByRole("option", { name: type, exact: true }).click();
  if (options !== undefined) await dialog.getByLabel(t.fields.newOptions, { exact: true }).fill(options);
  await dialog.getByRole("button", { name: t.fields.add }).click();
  return dialog;
}

test.describe("F10 özel alan ekle", () => {
  test("F10-H1 sayı alanı eklenir, kartta değer girilir ve yerel biçimde gösterilir", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const dialog = await addField(page, "Bütçe", t.fields.types.numeric);
    await expect(dialog.getByLabel(fill(t.fields.nameOf, { name: "Bütçe" }))).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fieldsPanel(page).getByRole("button", { name: t.fields.manage })).toBeFocused();

    await fieldsPanel(page).getByRole("button", { name: new RegExp("^Bütçe ") }).click();
    const input = fieldsPanel(page).getByLabel("Bütçe");
    await input.fill("12500,5");
    await input.press("Enter");
    await expect(fieldsPanel(page).getByRole("button", { name: new RegExp("^Bütçe 12\\.500,5 ") })).toBeVisible();

    const field = (await leadFields(api)).find((item) => item.name === "Bütçe")!;
    expect((await customOf(api))[field.id]).toBe(12500.5);
  });

  test("F10-H2 her alan türüne karttan değer girilir: metin, bağlantı, tarih, onay kutusu, tek ve çoklu seçim", async ({ page, api }) => {
    for (const [name, type, options] of [
      ["Renk tercihi", "text", undefined],
      ["Proje dosyası", "url", undefined],
      ["Numune istendi", "checkbox", undefined],
      ["Ürün grupları", "multiselect", ["Masa", "Dolap", "Kitaplık"]],
    ] as const) {
      expect((await api.post("/fields", { entityType: "lead", name, type, options })).status).toBe(201);
    }
    await gotoLead(page, "l-kitchen");
    const panel = fieldsPanel(page);

    // metin
    await panel.getByRole("button", { name: /^Renk tercihi / }).click();
    await panel.getByLabel("Renk tercihi").fill("Antrasit, mat 🎨");
    await panel.getByLabel("Renk tercihi").press("Enter");
    await expect(panel.getByRole("button", { name: /^Renk tercihi Antrasit, mat 🎨 / })).toBeVisible();

    // bağlantı: kaydedilince yeni sekmede açan bağlantı çıkar
    await panel.getByRole("button", { name: /^Proje dosyası / }).click();
    await panel.getByLabel("Proje dosyası").fill("https://ornek.test/proje?id=1");
    await panel.getByLabel("Proje dosyası").press("Enter");
    const link = panel.getByRole("link", { name: fill(t.fields.openLink, { name: "Proje dosyası" }) });
    await expect(link).toHaveAttribute("href", "https://ornek.test/proje?id=1");
    await expect(link).toHaveAttribute("rel", /noopener/);

    // tarih
    await panel.getByLabel("Teslim tarihi").fill("2027-01-15");
    await panel.getByLabel("Teslim tarihi").blur();

    // onay kutusu
    const toggle = panel.getByRole("switch", { name: "Numune istendi" });
    await toggle.click();
    await expect(toggle).toBeChecked();

    // tek seçim
    await choose(page, "Nereden duydu", "Instagram");
    await expect(panel.getByRole("combobox", { name: "Nereden duydu" })).toHaveText("Instagram");

    // çoklu seçim
    await panel.getByRole("button", { name: fill(t.fields.choose, { name: "Ürün grupları" }) }).click();
    // Art arda iki işaretleme: ikincisi birincinin kaydını beklemeden yapılır, ikisi de kalmalı.
    await page.getByRole("checkbox", { name: "Masa" }).click();
    await page.getByRole("checkbox", { name: "Kitaplık" }).click();
    await expect(page.getByRole("checkbox", { name: "Masa" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Kitaplık" })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(panel.getByRole("button", { name: fill(t.fields.choose, { name: "Ürün grupları" }) })).toHaveText("Masa, Kitaplık");

    const fields = await leadFields(api);
    const id = (name: string) => fields.find((field) => field.name === name)!.id;
    const option = (name: string, label: string) => fields.find((field) => field.name === name)!.options.find((item) => item.label === label)!.id;
    await expect
      .poll(async () => customOf(api))
      .toMatchObject({
        [id("Renk tercihi")]: "Antrasit, mat 🎨",
        [id("Proje dosyası")]: "https://ornek.test/proje?id=1",
        "f-delivery": "2027-01-15",
        [id("Numune istendi")]: true,
        "f-source": "o-insta",
        [id("Ürün grupları")]: [option("Ürün grupları", "Masa"), option("Ürün grupları", "Kitaplık")],
      });

    // Sayfa yenilenince değerler yerinde.
    await page.reload();
    await expect(fieldsPanel(page).getByRole("switch", { name: "Numune istendi" })).toBeChecked();
    await expect(fieldsPanel(page).getByLabel("Teslim tarihi")).toHaveValue("2027-01-15");
  });

  test("F10-E5 geçersiz sayı ve bağlantı kaydedilmez, neden satır içinde söylenir", async ({ page, api }) => {
    expect((await api.post("/fields", { entityType: "lead", name: "Adet", type: "numeric" })).status).toBe(201);
    expect((await api.post("/fields", { entityType: "lead", name: "Site", type: "url" })).status).toBe(201);
    await gotoLead(page, "l-kitchen");
    const panel = fieldsPanel(page);

    await panel.getByRole("button", { name: /^Adet / }).click();
    await panel.getByLabel("Adet").fill("on iki");
    await panel.getByLabel("Adet").press("Enter");
    await expect(panel.getByText(t.fields.numberInvalid)).toBeVisible();
    await panel.getByLabel("Adet").press("Escape");

    await panel.getByRole("button", { name: /^Site / }).click();
    await panel.getByLabel("Site").fill("javascript:alert(1)");
    await panel.getByLabel("Site").press("Enter");
    await expect(panel.getByText(t.fields.urlInvalid)).toBeVisible();
    await panel.getByLabel("Site").press("Escape");

    const custom = await customOf(api);
    expect(Object.keys(custom)).toEqual(["f-source"]);
  });

  test("F10-E7 alan sırası değiştirilir ve sayfa yenilenince korunur", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const dialog = await openManage(page);
    await dialog.getByRole("button", { name: fill(t.fields.moveUp, { name: "Teslim tarihi" }) }).click();
    await expect.poll(async () => (await leadFields(api)).map((field) => field.name)).toEqual(["Teslim tarihi", "Nereden duydu"]);
    await page.reload();
    await expect(fieldsPanel(page).getByLabel("Teslim tarihi")).toBeVisible();
    const labels = await fieldsPanel(page).locator("label").allTextContents();
    expect(labels.indexOf("Teslim tarihi")).toBeLessThan(labels.indexOf("Nereden duydu"));
  });

  test("F10-E3 kullanılan alan onayla silinir; kayıtlardaki değeri de silinir", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    expect(await customOf(api)).toHaveProperty("f-source");
    const dialog = await openManage(page);
    await dialog.getByRole("button", { name: fill(t.fields.remove, { name: "Nereden duydu" }) }).click();
    await expect(dialog.getByText(fill(t.fields.removeBody, { name: "Nereden duydu" }))).toBeVisible();
    // Vazgeçilirse alan durur.
    await dialog.getByRole("button", { name: t.common.cancel }).click();
    await expect(dialog.getByLabel(fill(t.fields.nameOf, { name: "Nereden duydu" }))).toBeVisible();

    await dialog.getByRole("button", { name: fill(t.fields.remove, { name: "Nereden duydu" }) }).click();
    await dialog.getByRole("button", { name: t.fields.removeConfirm }).click();
    await expect(dialog.getByLabel(fill(t.fields.nameOf, { name: "Nereden duydu" }))).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(fieldsPanel(page).getByText("Nereden duydu")).toHaveCount(0);
    expect(await customOf(api)).not.toHaveProperty("f-source");
  });

  test("F10-E4 kullanılan seçenek listeden çıkarılınca o değeri taşıyan kayıtlar boşalır", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await expect(fieldsPanel(page).getByRole("combobox", { name: "Nereden duydu" })).toHaveText("Tavsiye");
    const dialog = await openManage(page);
    const options = dialog.getByLabel(fill(t.fields.optionsOf, { name: "Nereden duydu" }));
    await options.fill("Instagram\nWeb sitesi\nFuar");
    await options.blur();
    await expect.poll(async () => (await leadFields(api)).find((field) => field.id === "f-source")!.options.map((item) => item.label)).toEqual(["Instagram", "Web sitesi", "Fuar"]);
    await page.keyboard.press("Escape");
    await expect(fieldsPanel(page).getByRole("combobox", { name: "Nereden duydu" })).toHaveText(t.fields.notSet);
    expect(await customOf(api)).not.toHaveProperty("f-source");
    // Kalan seçenekler kimliğini korur; yenisi eklenir.
    await choose(page, "Nereden duydu", "Fuar");
    await expect(fieldsPanel(page).getByRole("combobox", { name: "Nereden duydu" })).toHaveText("Fuar");
  });

  test.describe("geçersiz alan tanımları", () => {
    test.use({ allow4xx: [404, 409, 422] });

    test("F10-E1 seçenekli alan seçeneksiz eklenemez", async ({ page, api }) => {
      await gotoLead(page, "l-kitchen");
      const dialog = await addField(page, "Kategori", t.fields.types.select, "   \n  ");
      await expect(dialog.getByText(t.errors.options_required)).toBeVisible();
      expect((await leadFields(api)).map((field) => field.name)).not.toContain("Kategori");
    });

    test("F10-E2 aynı adla ikinci alan eklenemez (Türkçe büyük/küçük harf ayrımı olmadan)", async ({ page, api }) => {
      await gotoLead(page, "l-kitchen");
      const dialog = await addField(page, "TESLİM TARİHİ", t.fields.types.text);
      await expect(dialog.getByText(t.errors.field_exists)).toBeVisible();
      expect(await leadFields(api)).toHaveLength(2);
      // Aynı ad başka kayıt türünde serbesttir.
      expect((await api.post("/fields", { entityType: "contact", name: "Teslim tarihi", type: "date" })).status).toBe(201);
    });

    test("F10-N1 API: türüne uymayan değer, başka türün alanı, olmayan seçenek reddedilir ve hiçbir şey yazılmaz", async ({ api }) => {
      const before = await customOf(api);
      const bad = [
        { "f-delivery": "2026-02-30" },
        { "f-delivery": 20260101 },
        { "f-source": "o-yok" },
        { "f-title": "Müdür" },
        { "f-yok": "x" },
        { "f-source": "o-web", "f-delivery": "yarın" },
      ];
      for (const custom of bad) {
        const response = await api.patch("/leads/l-kitchen", { custom });
        expect(response.status, JSON.stringify(custom)).toBeGreaterThanOrEqual(404);
      }
      expect(await customOf(api)).toEqual(before);
      // Kısmi güncelleme: yalnız verilen alan değişir, null boşaltır.
      expect((await api.patch("/leads/l-kitchen", { custom: { "f-delivery": "2027-03-01" } })).status).toBe(200);
      expect(await customOf(api)).toEqual({ ...before, "f-delivery": "2027-03-01" });
      expect((await api.patch("/leads/l-kitchen", { custom: { "f-delivery": null } })).status).toBe(200);
      expect(await customOf(api)).toEqual(before);
    });

    test("F10-E8 bir kayıt türünde en çok 100 alan", async ({ api }) => {
      let status = 201;
      let added = 0;
      while (status === 201 && added < 120) {
        status = (await api.post("/fields", { entityType: "company", name: `Alan ${added}`, type: "text" })).status;
        if (status === 201) added += 1;
      }
      expect(status).toBe(422);
      expect(((await api.get("/fields?entity=company")) as unknown[]).length).toBe(100);
    });
  });

  test.describe("yönetici olmayan kullanıcı", () => {
    test.use({ asUser: "u-bora", allow4xx: [403] });

    test("F10-E6 yönetici olmayan alanları yönetemez ama değer girebilir", async ({ page, api }) => {
      await gotoLead(page, "l-desks");
      await expect(fieldsPanel(page).getByRole("button", { name: t.fields.manage })).toHaveCount(0);
      await choose(page, "Nereden duydu", "Web sitesi");
      await expect.poll(async () => (await customOf(api, "l-desks"))["f-source"]).toBe("o-web");

      expect((await api.post("/fields", { entityType: "lead", name: "İzinsiz", type: "text" })).status).toBe(403);
      expect((await api.patch("/fields/f-source", { name: "İzinsiz" })).status).toBe(403);
      expect((await api.delete("/fields/f-source")).status).toBe(403);
      expect((await leadFields(api)).map((field) => field.name)).toEqual(["Nereden duydu", "Teslim tarihi"]);
    });
  });
});
