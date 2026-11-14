import { card, column, expect, expectNoA11yViolations, fill, gotoBoard, STAGE, t, test, WS } from "./support";
import type { Page } from "@playwright/test";

const s = t.sources;
const g = t.sheets;
const SHEET = "Reklam formu yanıtları";
const FILE = "dev-sheet-reklam";

const sheetsButton = (page: Page) => page.getByRole("button", { name: fill(s.connectLabel, { name: s.items.google_sheets.name }) });
const leadCount = async (page: Page) => ((await (await page.request.get(`/api/w/${WS}/leads?status=all`)).json()) as unknown[]).length;
/** Google'daki bir kullanıcının tabloya satır eklemesi: taklit, izleyen kanala bildirim de gönderir. */
const appendRow = (page: Page, row: string[], title?: string) => page.request.post("/api/dev/google/control", { data: { append: { fileId: FILE, title, row } } });

/** Kaynaklar ekranından Google ile oturum açar ve tablo seçme adımına gelir. */
async function signInWithGoogle(page: Page) {
  await page.goto(`/w/${WS}/sources`);
  await expect(page.getByRole("heading", { name: s.connectedTitle })).toBeVisible();
  await sheetsButton(page).click();
  const dialog = page.getByRole("dialog", { name: fill(s.dialogTitle, { name: s.items.google_sheets.name }) });
  await dialog.getByRole("button", { name: new RegExp(`^${g.methodGoogle}`) }).click();
  await expect(dialog.getByText(g.signInBody)).toBeVisible();
  await dialog.getByRole("link", { name: g.signIn }).click();
  // İzin ekranından dönünce pencere kaldığı yerden açılır ve adres temizlenir.
  await expect(page).toHaveURL(new RegExp(`/w/${WS}/sources$`));
  await expect(dialog.getByText(g.devAccount)).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: g.account })).toContainText("deneme@gmail.test");
  return dialog;
}

async function connect(page: Page, options: { importExisting?: boolean; tab?: string } = {}) {
  const dialog = await signInWithGoogle(page);
  await dialog.getByRole("button", { name: SHEET }).click();
  await expect(dialog.getByText(g.columns)).toBeVisible();
  if (options.tab) {
    await dialog.getByRole("combobox", { name: g.tab }).click();
    await page.getByRole("option", { name: options.tab }).click();
  }
  await dialog.getByLabel(new RegExp(`^${t.intakes.name}`)).fill("Reklam tablosu");
  if (options.importExisting) await dialog.getByRole("checkbox", { name: g.importExisting }).click();
  return dialog;
}

test.describe("F19 Google hesabıyla tablo bağlama (yerel Google taklidiyle)", () => {
  test("F19-H1 oturum açılır, tablo seçilir; sonradan eklenen satır elle eşitlemeden lead olur", async ({ page }) => {
    const before = await leadCount(page);
    const dialog = await connect(page);
    for (const column of ["Ad Soyad", "Telefon", "E-posta", "Tutar"]) await expect(dialog.getByText(column, { exact: true })).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: g.submit }).click();
    await expect(dialog.getByText(new RegExp(`^${fill(g.done, { name: "Reklam tablosu" })}`))).toBeVisible();
    await dialog.getByRole("button", { name: t.intakes.done }).click();

    // Bağlı kaynak: hesap, tablo ve sayfa adıyla; gizli adres yok, yerine elle eşitleme var.
    const row = page.getByRole("listitem").filter({ hasText: "Reklam tablosu" });
    await expect(row.getByText(fill(g.linkLine, { email: "deneme@gmail.test", spreadsheet: SHEET, tab: "Form Yanıtları 1" }))).toBeVisible();
    await expect(row.getByText(g.live, { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: fill(t.intakes.rotateLabel, { name: "Reklam tablosu" }) })).toHaveCount(0);
    await expectNoA11yViolations(page);
    // Var olan iki satır aktarılmadı.
    expect(await leadCount(page)).toBe(before);

    // Tabloya yeni satır düşer; Google bildirir, lead hemen oluşur.
    const appended = await appendRow(page, ["14.11.2026 11:05", "Nazlı Güneş", "+90 555 333 44 55", "nazli@ornek.test", "27.500", "Gardırop"]);
    expect(((await appended.json()) as { notified: number }).notified).toBe(1);
    expect(await leadCount(page)).toBe(before + 1);
    await gotoBoard(page);
    const lead = card(column(page, STAGE.first), "Reklam tablosu: Nazlı Güneş");
    await expect(lead).toBeVisible();
    await expect(lead).toContainText("₺27.500");
  });

  test("F19-H2 “var olan satırları da aktar” işaretlenirse eldeki satırlar da lead olur; yeniden eşitleme çoğaltmaz", async ({ page }) => {
    const before = await leadCount(page);
    const dialog = await connect(page, { importExisting: true });
    await dialog.getByRole("button", { name: g.submit }).click();
    await expect(dialog.getByText(new RegExp(`^${fill(g.doneImported, { name: "Reklam tablosu", count: 2 })}`))).toBeVisible();
    await dialog.getByRole("button", { name: t.intakes.done }).click();
    expect(await leadCount(page)).toBe(before + 2);

    await page.getByRole("button", { name: fill(g.syncLabel, { name: "Reklam tablosu" }) }).click();
    await expect(page.getByText(g.syncedNone)).toBeVisible();
    expect(await leadCount(page)).toBe(before + 2);

    // Boş satır atlanır; ardından gelen dolu satır lead olur. Zamanlanmış iş de aynı sonucu verir.
    await appendRow(page, ["", "", "", "", "", ""]);
    await appendRow(page, ["", "Sami Tok", "+90 555 444 55 66", "", "", ""]);
    expect(await leadCount(page)).toBe(before + 3);
    const job = (await (await page.request.post("/api/jobs/sheets")).json()) as { links: number; created: number };
    expect(job).toMatchObject({ links: 1, created: 0 });
  });

  test("F19-E1 adında boşluk ve tek tırnak olan sayfa seçilip bağlanır", async ({ page }) => {
    const before = await leadCount(page);
    const dialog = await connect(page, { tab: "Arşiv 'eski'" });
    await expect(dialog.getByText("Not", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: g.submit }).click();
    await dialog.getByRole("button", { name: t.intakes.done }).click();
    await appendRow(page, ["Arşivden Gelen", "eski müşteri"], "Arşiv 'eski'");
    expect(await leadCount(page)).toBe(before + 1);
    // Öbür sayfaya eklenen satır bu bağlantıdan lead olmaz.
    await appendRow(page, ["", "Başka Sayfa", "", "", "", ""]);
    expect(await leadCount(page)).toBe(before + 1);
  });

  test("F19-E2 Google izni kalkarsa bağlantı bunu söyler; hesap yeniden bağlanınca eşitleme sürer", async ({ page }) => {
    const before = await leadCount(page);
    const dialog = await connect(page);
    await dialog.getByRole("button", { name: g.submit }).click();
    await dialog.getByRole("button", { name: t.intakes.done }).click();

    await page.request.post("/api/dev/google/control", { data: { revoke: true } });
    await appendRow(page, ["", "İzin Yokken", "+90 555 000 11 22", "", "", ""]);
    expect(await leadCount(page)).toBe(before);
    await page.getByRole("button", { name: fill(g.syncLabel, { name: "Reklam tablosu" }) }).click();
    await expect(page.getByText(g.problems.google_reconnect).first()).toBeVisible();

    // Yeniden bağlanma: aynı Google hesabı tanınır, ikinci hesap açılmaz; bekleyen satır gelir.
    await sheetsButton(page).click();
    const again = page.getByRole("dialog");
    await again.getByRole("button", { name: new RegExp(`^${g.methodGoogle}`) }).click();
    await expect(again.getByText(g.reconnect)).toBeVisible();
    await again.getByRole("link", { name: g.signIn }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/sources$`));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: fill(g.syncLabel, { name: "Reklam tablosu" }) }).click();
    await expect(page.getByText(fill(g.synced, { count: 1 }))).toBeVisible();
    expect(await leadCount(page)).toBe(before + 1);
    expect(((await (await page.request.get(`/api/w/${WS}/google/accounts`)).json()) as { accounts: unknown[] }).accounts).toHaveLength(1);
  });

  test.describe("reddedilen istekler", () => {
    test.use({ allow4xx: [403, 404, 422] });

    test("F19-N1 sahte bildirim ve sahte dönüş hiçbir şey yapmaz; başlıksız sayfa bağlanmaz", async ({ page, api }) => {
      const before = await leadCount(page);
      const dialog = await connect(page);
      await dialog.getByRole("button", { name: g.submit }).click();
      await dialog.getByRole("button", { name: t.intakes.done }).click();

      // Kanal kimliği ya da gizli anahtarı tutmayan bildirim yok sayılır.
      const hook = await page.request.post("/api/google/drive-hook", { headers: { "X-Goog-Channel-ID": "sheet-uydurma", "X-Goog-Channel-Token": "yanlis", "X-Goog-Resource-State": "update" } });
      expect(hook.status()).toBe(200);
      expect(await leadCount(page)).toBe(before);

      // İmzasız "state" ile dönüş hesap kaydetmez.
      const forged = await page.request.get("/api/google/callback?code=dev-code-99&state=uydurma.imza", { maxRedirects: 0 });
      expect(forged.status()).toBe(302);
      expect(forged.headers().location).toMatch(/\/login$/);
      expect(((await api.get("/google/accounts")) as { accounts: unknown[] }).accounts).toHaveLength(1);

      const accountId = ((await api.get("/google/accounts")) as { accounts: Array<{ id: string }> }).accounts[0].id;
      expect((await api.post("/sheet-links", { accountId, spreadsheetId: "dev-sheet-yok", sheetId: 0, name: "Yok", stageId: "s-first" })).status).toBe(404);
      expect((await api.post("/google/inspect", { accountId, spreadsheetId: "../kacis" })).status).toBe(422);
    });

    test.describe("yönetici olmayan kullanıcı", () => {
      test.use({ asUser: "u-bora" });

      test("F19-N2 yönetici olmayan Google hesabı bağlayamaz, tablo bağlayamaz", async ({ page, api }) => {
        const start = await page.request.get(`/api/w/${WS}/google/start`, { maxRedirects: 0 });
        expect(start.status()).toBe(403);
        expect(((await api.get("/google/accounts")) as { accounts: unknown[] }).accounts).toHaveLength(0);
        expect((await api.post("/sheet-links", { accountId: "u-ada", spreadsheetId: FILE, sheetId: 0, name: "İzinsiz", stageId: "s-first" })).status).toBe(403);
      });
    });
  });
});
