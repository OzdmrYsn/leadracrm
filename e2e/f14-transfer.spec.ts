import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { parseCsv } from "../src/lib/csv";
import { actAs, choose, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, t, test, WS } from "./support";

type Summary = { id: string; name: string; stageId: string; priceMinor: number; contactName: string | null; companyName: string | null; responsible: { id: string } | null; tags: Array<{ name: string }> };

const FULL = { view: "all", edit: "all", add: true, delete: "all", export: "all" };
const full = { leads: FULL, contacts: FULL, companies: FULL, tasks: { view: "all", edit: "all", delete: "all" }, inbox: { view: "all" } };
const c = t.transfer.columns;

const leadsOf = async (api: { get: (path: string) => Promise<unknown> }) => (await api.get("/leads?status=all")) as Summary[];
const csvFile = (name: string, text: string | Buffer) => ({ name, mimeType: "text/csv", buffer: typeof text === "string" ? Buffer.from(text, "utf8") : text });

async function gotoList(page: Page) {
  await page.goto(`/w/${WS}/leads`);
  await expect(page.getByRole("table")).toBeVisible();
}

/** İndirmeyi başlatan eylemi çalıştırır ve dosyayı satırlarına ayrılmış olarak döndürür. */
async function download(page: Page, start: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent("download"), start()]);
  const raw = await readFile((await file.path())!, "utf8");
  return { name: file.suggestedFilename(), raw, rows: parseCsv(raw) };
}

async function openImport(page: Page) {
  await page.getByRole("button", { name: t.transfer.more }).click();
  await page.getByRole("menuitem", { name: t.transfer.import }).click();
  const dialog = page.getByRole("dialog", { name: t.transfer.importTitle });
  await expect(dialog).toBeVisible();
  return dialog;
}

const target = (page: Page, column: string) => page.getByRole("combobox", { name: fill(t.transfer.targetOf, { column }) });

test.describe("F14 Dışa aktarma", () => {
  test("F14-H1 lead listesi ekrandaki süzgeçle CSV olarak iner; sütunlar ve değerler okunur", async ({ page, api }) => {
    const fields = (await api.get("/fields?entity=lead")) as Array<{ id: string; name: string; options: Array<{ id: string; label: string }> }>;
    const source = fields.find((field) => field.name === "Nereden duydu")!;
    expect((await api.patch("/leads/l-kitchen", { custom: { [source.id]: source.options[0].id } })).status).toBe(200);

    await gotoList(page);
    const all = await download(page, async () => {
      await page.getByRole("button", { name: t.transfer.more }).click();
      await page.getByRole("menuitem", { name: t.transfer.export }).click();
    });
    expect(all.name).toMatch(/^leadler-\d{4}-\d{2}-\d{2}\.csv$/);
    await expect(page.getByText(fill(t.transfer.exported, { name: all.name }))).toBeVisible();
    // Türkçe Excel için: BOM ve noktalı virgül.
    expect(all.raw.charCodeAt(0)).toBe(0xfeff);
    const [header, ...rows] = all.rows;
    expect(header.slice(0, 11)).toEqual([c.lead, c.price, c.currency, c.pipeline, c.stage, c.responsible, c.contact, c.company, c.phone, c.email, c.tags]);
    expect(header).toContain("Nereden duydu");
    // Varsayılan liste açık lead'leri gösterir: kapanmış lead dosyada da yoktur.
    expect(rows.map((row) => row[0])).not.toContain("Kitaplık");
    expect(rows).toHaveLength(5);
    const kitchen = rows.find((row) => row[0] === "Mutfak yenileme")!;
    expect(kitchen.slice(1, 11)).toEqual(["64000", "TRY", "Satış", "Görüşme", "Ada Yıldız", "Deniz Arslan", "Kuzey Mobilya", "+90 555 010 20 30", "deniz@kuzeymobilya.test", "Bayi, VIP"]);
    expect(kitchen[header.indexOf("Nereden duydu")]).toBe(source.options[0].label);

    // Arama süzgeci dosyaya da uygulanır.
    await page.getByRole("searchbox", { name: t.filter.searchLabel }).fill("mutfak");
    await expect(page.getByRole("status").filter({ hasText: fill(t.leads.count, { count: 1 }) })).toBeVisible();
    const filtered = await download(page, async () => {
      await page.getByRole("button", { name: t.transfer.more }).click();
      await page.getByRole("menuitem", { name: t.transfer.export }).click();
    });
    expect(filtered.rows.slice(1).map((row) => row[0])).toEqual(["Mutfak yenileme"]);
  });

  test("F14-H2 kişi ve şirket listeleri dışa aktarılır", async ({ page }) => {
    await page.goto(`/w/${WS}/contacts`);
    await expect(page.getByRole("table")).toBeVisible();
    const contacts = await download(page, () => page.getByRole("button", { name: t.transfer.exportShort }).click());
    expect(contacts.name).toMatch(/^kisiler-/);
    expect(contacts.rows[0].slice(0, 5)).toEqual([c.contact, c.company, c.phone, c.email, c.responsible]);
    expect(contacts.rows.find((row) => row[0] === "Deniz Arslan")!.slice(1, 5)).toEqual(["Kuzey Mobilya", "+90 555 010 20 30", "deniz@kuzeymobilya.test", "Ada Yıldız"]);

    await page.goto(`/w/${WS}/companies`);
    await expect(page.getByRole("table")).toBeVisible();
    const companies = await download(page, () => page.getByRole("button", { name: t.transfer.exportShort }).click());
    expect(companies.name).toMatch(/^sirketler-/);
    expect(companies.rows.find((row) => row[0] === "Kuzey Mobilya")!.slice(1, 4)).toEqual(["Ada Yıldız", "1", "1"]);
  });

  test("F14-E1 formül gibi başlayan ad dosyada etkisizleştirilir; ayırıcı ve tırnak içeren ad bozulmaz", async ({ page, api }) => {
    expect((await api.post("/leads", { name: '=HYPERLINK("http://kotu.test";"tıkla")' })).status).toBe(201);
    expect((await api.post("/leads", { name: 'Masa; 3 "büyük" boy' })).status).toBe(201);
    const response = await page.request.get(`/api/w/${WS}/leads/export`);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["cache-control"]).toBe("no-store");
    const raw = await response.text();
    expect(raw).toContain(`"'=HYPERLINK(""http://kotu.test"";""tıkla"")"`);
    const names = parseCsv(raw).map((row) => row[0]);
    expect(names).toContain('Masa; 3 "büyük" boy');
    expect(names).toContain(`'=HYPERLINK("http://kotu.test";"tıkla")`);
  });

  test.describe("yetki", () => {
    test.use({ allow4xx: [403] });

    test("F14-N1 dışa aktarma yetkisi yoksa düğme görünmez ve uç reddeder; \"kendi\" yetkisiyle yalnız kendi kayıtları iner", async ({ page, api }) => {
      // Cem her şeyi görür ama dışa aktaramaz.
      const none = { ...FULL, export: "none" };
      expect((await api.patch("/members/u-cem", { rights: { ...full, leads: none, contacts: none, companies: none } })).status).toBe(200);
      await actAs(page, "u-cem");
      await gotoList(page);
      await expect(page.getByText("Mutfak yenileme")).toBeVisible();
      // Menüde etiket yönetimi durur; dışa ve içe aktarma yoktur.
      await page.getByRole("button", { name: t.transfer.more }).click();
      await expect(page.getByRole("menuitem", { name: t.tags.manage })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: t.transfer.export })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: t.transfer.import })).toHaveCount(0);
      await page.keyboard.press("Escape");
      for (const path of ["leads", "contacts", "companies"]) {
        const denied = await page.request.get(`/api/w/${WS}/${path}/export`);
        expect(denied.status(), path).toBe(403);
        expect((await denied.json()).error.code).toBe("no_permission");
      }
      await page.goto(`/w/${WS}/contacts`);
      await expect(page.getByRole("link", { name: "Deniz Arslan" })).toBeVisible();
      await expect(page.getByRole("button", { name: t.transfer.exportShort })).toHaveCount(0);

      // Yönetici matristen "kendi" verir: Cem bütün lead'leri görür, yalnız kendisininkileri ve sahipsizleri indirir.
      await actAs(page, null);
      await page.goto(`/w/${WS}/settings/users`);
      await page.getByRole("button", { name: fill(t.team.editLabel, { name: "Cem Kara" }) }).click();
      const dialog = page.getByRole("dialog", { name: "Cem Kara" });
      await dialog.getByRole("radiogroup", { name: fill(t.access.cell, { entity: t.access.entities.leads, action: t.access.actions.export }) }).getByRole("radio", { name: t.access.levels.own }).click();
      await dialog.getByRole("button", { name: t.common.save }).click();
      await expect(dialog).toBeHidden();

      await actAs(page, "u-cem");
      expect((await api.post("/leads", { name: "Cem'in lead'i" })).status).toBe(201);
      await gotoList(page);
      const mine = await download(page, async () => {
        await page.getByRole("button", { name: t.transfer.more }).click();
        // Yönetici değil: içe aktarma menüde yok.
        await expect(page.getByRole("menuitem", { name: t.transfer.import })).toHaveCount(0);
        await page.getByRole("menuitem", { name: t.transfer.export }).click();
      });
      expect(mine.rows.slice(1).map((row) => row[0]).sort()).toEqual(["Cem'in lead'i", "Telegram talebi"]);
    });
  });
});

test.describe("F14 İçe aktarma", () => {
  test("F14-H3 CSV'den lead'ler oluşturulur: başlıklar kendiliğinden eşlenir; kişi, şirket, tutar, özel alan ve not yerine yazılır", async ({ page, api }) => {
    const before = (await leadsOf(api)).length;
    await gotoList(page);
    const dialog = await openImport(page);
    await expect(dialog.getByRole("button", { name: t.transfer.next })).toBeDisabled();
    await dialog.getByLabel(t.transfer.file).setInputFiles(
      csvFile(
        "musteriler.csv",
        [
          "Ad Soyad;Telefon;E-posta;Şirket;Tutar;Nereden duydu;Açıklama",
          "Ayşe Yılmaz;+90 532 111 22 33;ayse@yilmaz.test;Yılmaz İnşaat;12.500,50;Instagram;Mutfak dolabı istiyor",
          "Burak Öz;0533 444 55 66;;Öz Mimarlık;8000;;",
          'Selim Ak;;selim@ak.test;;abc;Bilinmeyen kaynak;"İki satırlı\nnot"',
        ].join("\n"),
      ),
    );
    await expect(dialog.getByText(fill(t.transfer.summary, { name: "musteriler.csv", rows: 3, columns: 7 }))).toBeVisible();
    await dialog.getByRole("button", { name: t.transfer.next }).click();

    // Tanınan başlıklar eşlenmiş, tanınmayan nota gidiyor.
    await expect(target(page, "Ad Soyad")).toContainText(t.transfer.targets.contact);
    await expect(target(page, "Telefon")).toContainText(t.transfer.targets.phone);
    await expect(target(page, "E-posta")).toContainText(t.transfer.targets.email);
    await expect(target(page, "Şirket")).toContainText(t.transfer.targets.company);
    await expect(target(page, "Tutar")).toContainText(t.transfer.targets.price);
    await expect(target(page, "Nereden duydu")).toContainText("Nereden duydu");
    await expect(target(page, "Açıklama")).toContainText(t.transfer.targets.note);
    await expectNoA11yViolations(page);

    await dialog.getByRole("button", { name: fill(t.transfer.start, { count: 3 }) }).click();
    await expect(dialog.getByText(fill(t.transfer.done, { count: 3 }))).toBeVisible();
    await dialog.getByRole("button", { name: t.transfer.close }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "Ayşe Yılmaz" })).toBeVisible();

    const leads = await leadsOf(api);
    expect(leads).toHaveLength(before + 3);
    const ayse = leads.find((lead) => lead.name === "Ayşe Yılmaz")!;
    // Varsayılanlar: ilk açık aşama, sorumlu içe aktaran.
    expect(ayse).toMatchObject({ stageId: "s-first", priceMinor: 1_250_050, contactName: "Ayşe Yılmaz", companyName: "Yılmaz İnşaat", responsible: { id: "u-ada" } });
    const detail = await api.get(`/leads/${ayse.id}`);
    const fields = (await api.get("/fields?entity=lead")) as Array<{ id: string; name: string; options: Array<{ id: string; label: string }> }>;
    const source = fields.find((field) => field.name === "Nereden duydu")!;
    expect(detail.lead.custom[source.id]).toBe(source.options.find((option) => option.label === "Instagram")!.id);
    expect(detail.contact.handles.map((handle: { value: string }) => handle.value).sort()).toEqual(["+90 532 111 22 33", "ayse@yilmaz.test"]);
    const feed = (await api.get(`/leads/${ayse.id}/feed`)) as Array<{ kind: string; note?: { body: string }; event?: { type: string; actorName: string | null } }>;
    expect(feed.find((item) => item.kind === "note")!.note!.body).toBe("Açıklama: Mutfak dolabı istiyor");
    expect(feed.find((item) => item.event?.type === "lead_created")!.event!.actorName).toBe("Ada Yıldız");

    // Biçimi bozuk tutar ve seçeneklerde olmayan değer satırı düşürmez: nota yazılır.
    const selim = leads.find((lead) => lead.name === "Selim Ak")!;
    expect(selim.priceMinor).toBe(0);
    const selimFeed = (await api.get(`/leads/${selim.id}/feed`)) as Array<{ kind: string; note?: { body: string } }>;
    const note = selimFeed.find((item) => item.kind === "note")!.note!.body;
    expect(note).toContain("Tutar: abc");
    expect(note).toContain("Nereden duydu: Bilinmeyen kaynak");
    expect(note).toContain("Açıklama: İki satırlı\nnot");
  });

  test("F14-H4 eşleme, aşama, sorumlu ve etiket elle seçilir; \"Aktarma\" seçilen sütun yazılmaz", async ({ page, api }) => {
    await gotoList(page);
    const dialog = await openImport(page);
    await dialog.getByLabel(t.transfer.file).setInputFiles(csvFile("teklifler.csv", "Proje,Yetkili,Dahili not\nOtel lobisi,Kemal Er,gizli\n"));
    await dialog.getByRole("button", { name: t.transfer.next }).click();
    await target(page, "Proje").click();
    await page.getByRole("option", { name: t.transfer.targets.name, exact: true }).click();
    await target(page, "Yetkili").click();
    await page.getByRole("option", { name: t.transfer.targets.contact, exact: true }).click();
    await target(page, "Dahili not").click();
    await page.getByRole("option", { name: t.transfer.targets.skip, exact: true }).click();
    await choose(page, t.transfer.stage, "Görüşme");
    await choose(page, t.transfer.responsible, t.common.unassigned);
    await choose(page, t.transfer.tag, "VIP");
    await dialog.getByRole("button", { name: fill(t.transfer.start, { count: 1 }) }).click();
    await expect(dialog.getByText(fill(t.transfer.done, { count: 1 }))).toBeVisible();

    const lead = (await leadsOf(api)).find((item) => item.name === "Otel lobisi")!;
    expect(lead).toMatchObject({ stageId: "s-talk", contactName: "Kemal Er", responsible: null });
    expect(lead.tags.map((tag) => tag.name)).toEqual(["VIP"]);
    const feed = (await api.get(`/leads/${lead.id}/feed`)) as Array<{ kind: string }>;
    expect(feed.filter((item) => item.kind === "note")).toHaveLength(0);
  });

  test("F14-E2 kayıtlı kişi yeniden oluşturulmaz; \"Atanmamış\" aktarılan lead'leri otomasyon sırayla dağıtır", async ({ api }) => {
    expect(
      (await api.post("/automations", { stageId: "s-first", onEvent: "lead_created", kind: "change_responsible", settings: { mode: "round_robin", userIds: ["u-ada", "u-bora"] } })).status,
    ).toBe(201);
    const contactsBefore = ((await api.get("/contacts")) as unknown[]).length;
    const result = await api.post("/leads/import", {
      stageId: "s-first",
      responsibleUserId: null,
      source: "İçe aktarma: test.csv",
      columns: [
        { header: "Konu", target: "name" },
        { header: "E-posta", target: "email" },
      ],
      rows: [
        ["Yeni mutfak", "DENIZ@kuzeymobilya.test"],
        ["Banyo dolabı", "deniz@kuzeymobilya.test"],
        ["", ""],
        ["Vestiyer", ""],
      ],
    });
    expect(result.body).toEqual({ created: 3, skipped: 1 });
    expect(((await api.get("/contacts")) as unknown[]).length).toBe(contactsBefore);
    const leads = await leadsOf(api);
    const kitchen = leads.find((lead) => lead.name === "Yeni mutfak")!;
    expect(kitchen).toMatchObject({ contactName: "Deniz Arslan", companyName: "Kuzey Mobilya" });
    expect(["Yeni mutfak", "Banyo dolabı", "Vestiyer"].map((name) => leads.find((lead) => lead.name === name)!.responsible?.id)).toEqual(["u-ada", "u-bora", "u-ada"]);
  });

  test("F14-E3 eski Türkçe Windows kodlamalı, virgülle ayrılmış dosya doğru okunur", async ({ page, api }) => {
    // "İsim,Şirket\nÇağrı Güneş,Işık Ltd" Windows-1254 baytlarıyla.
    const bytes = Buffer.from([0xdd, 0x73, 0x69, 0x6d, 0x2c, 0xde, 0x69, 0x72, 0x6b, 0x65, 0x74, 0x0a, 0xc7, 0x61, 0xf0, 0x72, 0xfd, 0x20, 0x47, 0xfc, 0x6e, 0x65, 0xfe, 0x2c, 0x49, 0xfe, 0xfd, 0x6b, 0x20, 0x4c, 0x74, 0x64]);
    await gotoList(page);
    const dialog = await openImport(page);
    await dialog.getByLabel(t.transfer.file).setInputFiles(csvFile("eski.csv", bytes));
    await dialog.getByRole("button", { name: t.transfer.next }).click();
    await expect(target(page, "İsim")).toContainText(t.transfer.targets.contact);
    await expect(target(page, "Şirket")).toContainText(t.transfer.targets.company);
    await dialog.getByRole("button", { name: fill(t.transfer.start, { count: 1 }) }).click();
    await expect(dialog.getByText(fill(t.transfer.done, { count: 1 }))).toBeVisible();
    expect((await leadsOf(api)).find((lead) => lead.name === "Çağrı Güneş")).toMatchObject({ companyName: "Işık Ltd" });
  });

  test("F14-E4 dosya denetimleri: çok büyük, yalnız başlık, çok satır; hata söylenir ve ilerlenemez", async ({ page }) => {
    await gotoList(page);
    const dialog = await openImport(page);
    const file = dialog.getByLabel(t.transfer.file);
    const next = dialog.getByRole("button", { name: t.transfer.next });

    await file.setInputFiles(csvFile("buyuk.csv", `Ad\n${"x".repeat(2 * 1024 * 1024)}`));
    await expect(dialog.getByText(t.transfer.tooBig)).toBeVisible();
    await expect(next).toBeDisabled();
    await file.setInputFiles(csvFile("bos.csv", "Ad;Telefon\n"));
    await expect(dialog.getByText(t.transfer.noRows)).toBeVisible();
    await file.setInputFiles(csvFile("cok.csv", `Ad\n${Array.from({ length: 10_001 }, (_, index) => `K${index}`).join("\n")}`));
    await expect(dialog.getByText(fill(t.transfer.tooManyRows, { count: "10.001" }))).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(file).toHaveAttribute("aria-invalid", "true");
    // Geçerli bir dosya hatayı temizler.
    await file.setInputFiles(csvFile("iyi.csv", "Ad\nAli Veli\n"));
    await expect(dialog.getByText(t.transfer.tooManyRows.slice(0, 12))).toHaveCount(0);
    await expect(next).toBeEnabled();
  });

  test("F14-E5 eşleme hataları: aynı alana iki sütun ve hiçbir şey eşlenmemesi", async ({ page }) => {
    await gotoList(page);
    const dialog = await openImport(page);
    await dialog.getByLabel(t.transfer.file).setInputFiles(csvFile("iki.csv", "Telefon;Cep\n0532 111 22 33;0533 444 55 66\n"));
    await dialog.getByRole("button", { name: t.transfer.next }).click();
    // İkinci telefon sütunu kendiliğinden nota gider; elle aynı alana eşlenirse reddedilir.
    await expect(target(page, "Cep")).toContainText(t.transfer.targets.note);
    await target(page, "Cep").click();
    await page.getByRole("option", { name: t.transfer.targets.phone, exact: true }).click();
    await dialog.getByRole("button", { name: fill(t.transfer.start, { count: 1 }) }).click();
    await expect(dialog.getByText(fill(t.transfer.duplicateTarget, { target: t.transfer.targets.phone }))).toBeVisible();
    for (const column of ["Telefon", "Cep"]) {
      await target(page, column).click();
      await page.getByRole("option", { name: t.transfer.targets.skip, exact: true }).click();
    }
    await dialog.getByRole("button", { name: fill(t.transfer.start, { count: 1 }) }).click();
    await expect(dialog.getByText(t.transfer.nothingMapped)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
  });

  test("F14-E6 büyük dosya parça parça gönderilir; ilerleme görünür, bütün satırlar aktarılır", async ({ page, api }) => {
    const before = (await leadsOf(api)).length;
    const requests: number[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/leads/import")) requests.push((request.postDataJSON() as { rows: unknown[] }).rows.length);
    });
    await gotoList(page);
    const dialog = await openImport(page);
    await dialog.getByLabel(t.transfer.file).setInputFiles(csvFile("toplu.csv", `Konu\n${Array.from({ length: 250 }, (_, index) => `Toplu lead ${index + 1}`).join("\n")}`));
    await dialog.getByRole("button", { name: t.transfer.next }).click();
    await dialog.getByRole("button", { name: fill(t.transfer.start, { count: 250 }) }).click();
    await expect(dialog.getByText(fill(t.transfer.done, { count: 250 }))).toBeVisible({ timeout: 60_000 });
    expect(requests).toEqual([200, 50]);
    expect((await leadsOf(api)).length).toBe(before + 250);
  });

  test.describe("reddedilenler", () => {
    test.use({ allow4xx: [403, 404, 422] });

    test("F14-N2 içe aktarmayı yalnız yönetici yapar; geçersiz hedefler hiçbir satırı aktarmaz", async ({ page, api }) => {
      const base = { stageId: "s-first", responsibleUserId: null, source: "x.csv", columns: [{ header: "Ad", target: "contact" }], rows: [["Ali Veli"]] };
      const before = (await leadsOf(api)).length;
      for (const [change, status] of [
        [{ stageId: "s-won" }, 422],
        [{ stageId: "s-other-open" }, 404],
        [{ responsibleUserId: "u-can" }, 404],
        [{ tagId: "t-yok" }, 404],
        [{ columns: [{ header: "Ad", target: "bilinmeyen" }] }, 422],
        [{ columns: [{ header: "Ad", target: "field:f-yok" }] }, 422],
        [{ columns: [{ header: "A", target: "phone" }, { header: "B", target: "phone" }], rows: [["1", "2"]] }, 422],
        [{ columns: [{ header: "Ad", target: "skip" }] }, 422],
        [{ rows: [] }, 422],
        [{ rows: Array.from({ length: 201 }, () => ["x"]) }, 422],
      ] as const) {
        expect((await api.post("/leads/import", { ...base, ...change })).status, JSON.stringify(change).slice(0, 60)).toBe(status);
      }
      expect((await leadsOf(api)).length).toBe(before);

      // Tam yetkili ama yönetici olmayan üye de içe aktaramaz.
      await actAs(page, "u-bora");
      const denied = await api.post("/leads/import", base);
      expect(denied.status).toBe(403);
      await actAs(page, null);
      expect((await leadsOf(api)).length).toBe(before);
    });
  });
});
