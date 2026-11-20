import { card, column, expect, expectNoA11yViolations, feed, fill, gotoBoard, STAGE, t, test, u, WS } from "./support";
import type { APIResponse, Page } from "@playwright/test";

const i = t.intakes;

type Created = { intake: { id: string; name: string }; token: string };

const s = t.sources;
const sheetsButton = (page: Page) => page.getByRole("button", { name: fill(s.connectLabel, { name: s.items.google_sheets.name }) });

async function gotoSources(page: Page) {
  await page.goto(`/w/${WS}/sources`);
  await expect(page.getByRole("heading", { name: s.connectedTitle })).toBeVisible();
  await expect(page.locator("#main [aria-busy]")).toHaveCount(0);
}

const send = (page: Page, token: string, data: unknown): Promise<APIResponse> => page.request.post(`/api/intake/${token}`, { data });

/** Google Sheets betiğinin gönderdiği biçim: satır kimliği ve başlık → değer. */
const row = (rowNumber: number, values: Record<string, string>) => ({ externalId: `tablo-1:0:${rowNumber}`, values });

test.describe("F18 dış kaynaktan lead al (Google Sheets ve genel adres)", () => {
  test("F18-H1 Google Sheets kaynağı ekrandan kurulur; gönderilen satır lead olur", async ({ page, api }) => {
    await gotoSources(page);
    await expectNoA11yViolations(page);
    await sheetsButton(page).click();
    const dialog = page.getByRole("dialog", { name: fill(s.dialogTitle, { name: s.items.google_sheets.name }) });
    // İki yol sunulur; bu test kod yapıştırma yolunu izler (Google hesabıyla bağlama: F19).
    await expect(dialog.getByRole("button", { name: new RegExp(`^${t.sheets.methodGoogle}`) })).toBeVisible();
    await dialog.getByRole("button", { name: new RegExp(`^${t.sheets.methodScript}`) }).click();
    // Ad önerilir; kullanıcı kendi adını yazar.
    await expect(dialog.getByLabel(i.name)).toHaveValue(fill(s.defaultName, { name: s.items.google_sheets.name }));
    await dialog.getByLabel(i.name).fill("Reklam formu");
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: i.submit }).click();

    // Gizli adres yalnız şimdi gösterilir; betik adresi içerir.
    const secret = page.getByRole("dialog", { name: i.secretTitle });
    await expect(secret).toBeVisible();
    const url = await secret.getByLabel(i.url).inputValue();
    expect(url).toMatch(/\/api\/intake\/[\w-]{40,}$/);
    await expect(secret.getByLabel(i.script)).toHaveValue(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(secret.getByText(i.localWarning)).toBeVisible();
    await expectNoA11yViolations(page);
    await secret.getByRole("button", { name: i.done }).click();
    await expect(page.getByText(i.never)).toBeVisible();
    await expect(sheetsButton(page)).toBeFocused();
    // Adres listede bir daha görünmez.
    await expect(page.locator("#main")).not.toContainText("/api/intake/");

    const response = await page.request.post(url, {
      data: row(2, { "Ad Soyad": "Gül Yılmaz", Telefon: "+90 555 444 33 22", "E-posta": "GUL@ornek.test", Tutar: "45.000", "Hangi ürün": "Mutfak dolabı 🍳" }),
    });
    expect(response.status()).toBe(201);
    const { leadId } = await response.json();

    await gotoBoard(page);
    const created = card(column(page, STAGE.first), "Reklam formu: Gül Yılmaz");
    await expect(created).toBeVisible();
    await expect(created).toContainText("₺45.000");
    await page.goto(u(`/w/${WS}/leads/${leadId}`));
    await expect(feed(page).getByText(t.event.createdIntake)).toBeVisible();
    // Tanınmayan sütun kaybolmaz: not olarak düşer.
    await expect(feed(page).getByText("Hangi ürün: Mutfak dolabı 🍳")).toBeVisible();
    const details = page.getByRole("region", { name: t.lead.details });
    await expect(details.getByRole("link", { name: "Gül Yılmaz" })).toBeVisible();
    await expect(details).toContainText("+90 555 444 33 22");
    await expect(details).toContainText("gul@ornek.test");

    await gotoSources(page);
    await expect(page.getByText(i.never)).toHaveCount(0);
    await expect(page.getByText(new RegExp(`^${fill(i.target, { stage: STAGE.first })}`))).toBeVisible();
    expect(((await api.get("/intakes")) as Array<Record<string, unknown>>)[0]).not.toHaveProperty("tokenHash");
  });

  test("F18-H3 katalogdan Zapier bağlanır: kendi kurulum adımları görünür, bağlı kaynak adıyla listelenir, düz gövde lead olur", async ({ page }) => {
    await gotoSources(page);
    await page.getByRole("button", { name: fill(s.connectLabel, { name: s.items.zapier.name }) }).click();
    const dialog = page.getByRole("dialog", { name: fill(s.dialogTitle, { name: s.items.zapier.name }) });
    await dialog.getByRole("button", { name: i.submit }).click();

    const secret = page.getByRole("dialog", { name: i.secretTitle });
    await expect(secret.getByRole("heading", { name: fill(s.guideTitle, { name: s.items.zapier.name }) })).toBeVisible();
    await expect(secret.getByText(s.guides.zapier[0])).toBeVisible();
    await expect(secret.getByLabel(i.script)).toHaveCount(0);
    const url = await secret.getByLabel(i.url).inputValue();
    const example = JSON.parse(await secret.getByLabel(s.flatExample).inputValue()) as Record<string, string>;
    await secret.getByRole("button", { name: i.done }).click();

    // Ekranda gösterilen örnek gövde olduğu gibi gönderilir.
    expect((await page.request.post(new URL(url).pathname, { data: example })).status()).toBe(201);
    const row = page.getByRole("listitem").filter({ hasText: fill(s.defaultName, { name: s.items.zapier.name }) });
    await expect(row.getByText(s.items.zapier.name, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(i.never)).toHaveCount(0);
  });

  test("F18-H4 Excel ve CSV karosu lead'ler ekranında aktarma penceresini açar", async ({ page }) => {
    await gotoSources(page);
    await page.getByRole("link", { name: fill(s.openImportLabel, { name: s.items.csv.name }) }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/leads\\?import=1`));
    await expect(page.getByRole("dialog", { name: t.transfer.importTitle })).toBeVisible();
  });

  test("F18-E10 sıradaki kanallar bağlanamaz: durumları ve gereken şey yazılıdır", async ({ page }) => {
    await gotoSources(page);
    const channels = page.getByRole("region", { name: s.channelsTitle });
    for (const key of ["whatsapp", "instagram", "viber"] as const) {
      const item = channels.getByRole("listitem").filter({ hasText: s.items[key].name });
      await expect(item.getByText(s.planned)).toBeVisible();
      await expect(item.getByText(s.items[key].need)).toBeVisible();
    }
    await expect(channels.getByRole("button")).toHaveCount(0);
    await expect(channels.getByRole("link")).toHaveCount(0);
  });

  test("F18-H2 kaynaktan gelen lead'ler otomasyonla sırayla dağıtılır", async ({ page, api }) => {
    await api.post("/automations", { stageId: "s-first", onEvent: "lead_created", kind: "change_responsible", settings: { mode: "round_robin", userIds: ["u-bora", "u-ada"] } });
    const { token } = (await api.post("/intakes", { name: "Form", kind: "generic", stageId: "s-first", tagId: "t-vip" })).body as Created;
    const owners: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await send(page, token, { ad: `Kişi ${index}`, telefon: `+90 555 000 00 0${index}` });
      const detail = await api.get(`/leads/${(await response.json()).leadId}`);
      owners.push(detail.lead.responsibleUserId);
      expect(detail.tags.map((tag: { name: string }) => tag.name)).toEqual(["VIP"]);
    }
    expect(owners).toEqual(["u-bora", "u-ada", "u-bora"]);
  });

  test("F18-E1 aynı satır yeniden gönderilirse ikinci lead açılmaz", async ({ page, api }) => {
    const { token } = (await api.post("/intakes", { name: "Tablo", kind: "google_sheets", stageId: "s-first" })).body as Created;
    const first = await send(page, token, row(5, { "Ad Soyad": "Tek Kayıt", Telefon: "+90 555 111 00 11" }));
    const again = await send(page, token, row(5, { "Ad Soyad": "Tek Kayıt", Telefon: "+90 555 111 00 11" }));
    expect([first.status(), again.status()]).toEqual([201, 200]);
    expect((await again.json()).leadId).toBe((await first.json()).leadId);
    // Dış kimlik verilmezse içerik aynıysa yine tek lead.
    const plain = { ad: "Kimliksiz Kayıt", "e-posta": "kimliksiz@ornek.test" };
    expect([(await send(page, token, plain)).status(), (await send(page, token, plain)).status()]).toEqual([201, 200]);
    const leads = (await api.get("/leads?status=all")) as Array<{ name: string }>;
    expect(leads.filter((lead) => lead.name.startsWith("Tablo: ")).length).toBe(2);
    // Aynı anda gelen iki kopya da tek lead olur.
    const twin = row(9, { "Ad Soyad": "Eşzamanlı" });
    const results = await Promise.all([send(page, token, twin), send(page, token, twin)]);
    expect(results.map((result) => result.status()).sort()).not.toEqual([201, 201]);
    expect(((await api.get("/leads?status=all")) as Array<{ name: string }>).filter((lead) => lead.name === "Tablo: Eşzamanlı").length).toBe(1);
  });

  test("F18-E3 e-postası ya da telefonu kayıtlı kişi yeniden oluşturulmaz; lead ona ve şirketine bağlanır", async ({ page, api }) => {
    const { token } = (await api.post("/intakes", { name: "Form", kind: "generic", stageId: "s-first" })).body as Created;
    const byEmail = await send(page, token, { isim: "D. Arslan", email: "Deniz@KuzeyMobilya.test", konu: "Yeni sipariş" });
    const detail = await api.get(`/leads/${(await byEmail.json()).leadId}`);
    expect(detail.lead.name).toBe("Yeni sipariş");
    expect(detail.lead.contactId).toBe("c-deniz");
    expect(detail.lead.companyId).toBe("co-kuzey");
    // Telefon boşluk ve tire farkına bakmadan eşleşir (Okan'ın numarası WhatsApp kimliği olarak kayıtlı).
    const byPhone = await send(page, token, { ad: "Okan", tel: "+90 (555) 070-80-90" });
    expect((await api.get(`/leads/${(await byPhone.json()).leadId}`)).lead.contactId).toBe("c-okan");
    expect(((await api.get("/contacts")) as unknown[]).length).toBe(5);
  });

  test("F18-E4 biçimi bozuk telefon, e-posta ve tutar kaydı düşürmez; değerler nota yazılır", async ({ page, api }) => {
    const { token } = (await api.post("/intakes", { name: "Form", kind: "generic", stageId: "s-first" })).body as Created;
    const response = await send(page, token, { ad: "Eksik Bilgi", telefon: "bilmiyorum", "e-posta": "yok", tutar: "pazarlık", not: "<b>kalın</b> & \"tırnak\"" });
    expect(response.status()).toBe(201);
    const leadId = (await response.json()).leadId;
    const detail = await api.get(`/leads/${leadId}`);
    expect(detail.lead.priceMinor).toBe(0);
    expect(detail.contact.name).toBe("Eksik Bilgi");
    expect(detail.contact.handles).toEqual([]);
    await page.goto(u(`/w/${WS}/leads/${leadId}`));
    for (const line of ["Telefon: bilmiyorum", "E-posta: yok", "Tutar: pazarlık", "not: <b>kalın</b> & \"tırnak\""]) {
      await expect(feed(page).getByText(line)).toBeVisible();
    }
  });

  test("F18-E5 sütun başlığı bir özel alanın adıyla aynıysa değer o alana yazılır", async ({ page, api }) => {
    const { token } = (await api.post("/intakes", { name: "Tablo", kind: "google_sheets", stageId: "s-first" })).body as Created;
    const response = await send(page, token, row(3, { "Ad Soyad": "Alanlı Kayıt", "TESLİM TARİHİ": "15.01.2027", "Nereden duydu": "web sitesi" }));
    const detail = await api.get(`/leads/${(await response.json()).leadId}`);
    expect(detail.lead.custom).toEqual({ "f-delivery": "2027-01-15", "f-source": "o-web" });
    // Türüne uymayan değer alana yazılmaz, nota düşer.
    const bad = await send(page, token, row(4, { "Ad Soyad": "Bozuk Tarih", "Teslim tarihi": "haftaya" }));
    const leadId = (await bad.json()).leadId;
    expect((await api.get(`/leads/${leadId}`)).lead.custom).toEqual({});
    const notes = ((await api.get(`/leads/${leadId}/feed`)) as Array<{ kind: string; note?: { body: string; authorName: string } }>).filter((item) => item.kind === "note");
    expect(notes[0].note).toMatchObject({ body: "Teslim tarihi: haftaya", authorName: "Tablo" });
  });

  test("F18-E6 geçersiz istekler: yanlış adres, bozuk gövde, çok büyük gövde; neden kaynağın satırında görünür", async ({ page, api }) => {
    const { token, intake } = (await api.post("/intakes", { name: "Form", kind: "generic", stageId: "s-first" })).body as Created;
    expect((await send(page, "olmayan-bir-anahtar", { ad: "x" })).status()).toBe(404);
    expect((await page.request.post(`/api/intake/${token}`, { data: "json değil", headers: { "content-type": "text/plain" } })).status()).toBe(400);
    expect((await send(page, token, ["dizi"])).status()).toBe(422);
    expect((await send(page, token, {})).status()).toBe(422);
    expect((await send(page, token, { ad: "x".repeat(70_000) })).status()).toBe(413);
    expect((await page.request.get(`/api/intake/${token}`)).status()).toBe(405);
    expect(((await api.get("/leads?status=all")) as unknown[]).length).toBe(6);

    await gotoSources(page);
    await expect(page.getByText(new RegExp(`^${fill(i.lastError, { error: "" }).trim()}`))).toBeVisible();
    // Geçerli bir kayıt gelince uyarı kalkar.
    expect((await send(page, token, { ad: "Düzgün Kayıt" })).status()).toBe(201);
    const listed = ((await api.get("/intakes")) as Array<{ id: string; lastError: string | null; lastReceivedAt: string | null }>).find((item) => item.id === intake.id)!;
    expect(listed.lastError).toBeNull();
    expect(listed.lastReceivedAt).not.toBeNull();
  });

  test("F18-E7 kapatılan kaynak ve yenilenen adres çalışmaz; yeni adres çalışır; silinen kaynağın lead'leri kalır", async ({ page, api }) => {
    const { token, intake } = (await api.post("/intakes", { name: "Form", kind: "generic", stageId: "s-first" })).body as Created;
    expect((await send(page, token, { ad: "İlk" })).status()).toBe(201);

    await gotoSources(page);
    const toggle = page.getByRole("switch", { name: fill(i.activeLabel, { name: "Form" }) });
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(async () => (await send(page, token, { ad: "Kapalıyken" })).status()).toBe(404);
    await toggle.click();
    await expect(toggle).toBeChecked();

    await page.getByRole("button", { name: fill(i.rotateLabel, { name: "Form" }) }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(i.rotateBody);
    await dialog.getByRole("button", { name: i.rotateConfirm }).click();
    await expect(page.getByRole("dialog", { name: i.secretTitle })).toBeVisible();
    const fresh = await dialog.getByLabel(i.url).inputValue();
    expect(fresh).not.toContain(token);
    await dialog.getByRole("button", { name: i.done }).click();
    expect((await send(page, token, { ad: "Eski adres" })).status()).toBe(404);
    expect((await page.request.post(fresh, { data: { ad: "Yeni adres" } })).status()).toBe(201);

    await page.getByRole("button", { name: fill(i.remove, { name: "Form" }) }).click();
    await page.getByRole("dialog").getByRole("button", { name: i.removeConfirm }).click();
    await expect(page.getByText(i.none)).toBeVisible();
    expect((await page.request.post(fresh, { data: { ad: "Silindikten sonra" } })).status()).toBe(404);
    expect(((await api.get("/intakes")) as unknown[]).some((item) => (item as { id: string }).id === intake.id)).toBe(false);
    const names = ((await api.get("/leads?status=all")) as Array<{ name: string }>).map((lead) => lead.name);
    expect(names).toEqual(expect.arrayContaining(["Form: İlk", "Form: Yeni adres"]));
    expect(names).not.toContain("Form: Kapalıyken");
  });

  test("F18-E8 dakikada 60 istekten fazlası reddedilir", async ({ page, api }) => {
    const { token } = (await api.post("/intakes", { name: "Yoğun", kind: "generic", stageId: "s-first" })).body as Created;
    const statuses: number[] = [];
    for (let index = 0; index < 62; index += 1) statuses.push((await send(page, token, { ad: `Kayıt ${index}` })).status());
    expect(statuses.slice(0, 60).every((status) => status === 201)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
    // Sınır adres başınadır: başka bir kaynak etkilenmez.
    const other = (await api.post("/intakes", { name: "Sakin", kind: "generic", stageId: "s-first" })).body as Created;
    expect((await send(page, other.token, { ad: "Tek kayıt" })).status()).toBe(201);
  });

  test("F18-E9 hedef aşama: gelen talepler olabilir, kapanmış aşama ve başka kiracının aşaması olamaz", async ({ page, api }) => {
    expect((await api.post("/intakes", { name: "Kapanmış", kind: "generic", stageId: "s-won" })).status).toBe(422);
    expect((await api.post("/intakes", { name: "Yabancı", kind: "generic", stageId: "s-other-open" })).status).toBe(404);
    expect((await api.post("/intakes", { name: "Yabancı etiket", kind: "generic", stageId: "s-first", tagId: "t-yok" })).status).toBe(404);
    expect((await api.post("/intakes", { name: " ", kind: "generic", stageId: "s-first" })).status).toBe(422);
    expect((await api.post("/intakes", { name: "Tür", kind: "excel", stageId: "s-first" })).status).toBe(422);

    const { token } = (await api.post("/intakes", { name: "Site formu", kind: "generic", stageId: "s-in" })).body as Created;
    const response = await send(page, token, { ad: "Form Dolduran", telefon: "+90 555 999 88 77" });
    const leadId = (await response.json()).leadId;
    await gotoBoard(page);
    const incoming = column(page, STAGE.incoming);
    await expect(card(incoming, "Site formu: Form Dolduran")).toBeVisible();
    // Gelen talep olarak kabul edilebilir.
    await incoming.getByRole("button", { name: fill(t.board.cardMenu, { name: "Site formu: Form Dolduran" }) }).click();
    await page.getByRole("menuitem", { name: t.board.accept }).click();
    await expect(card(column(page, STAGE.first), "Site formu: Form Dolduran")).toBeVisible();
    await expect.poll(async () => (await api.get(`/leads/${leadId}`)).lead.responsibleUserId).toBe("u-ada");
  });
});
