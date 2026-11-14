import type { Locator, Page } from "@playwright/test";
import { card, column, expect, feed, fill, gotoBoard, gotoLead, STAGE, t, test, WS } from "./support";

// Tıklama bütçesi: çekirdek akışlar, asıl ürünün herkese açık belgelerinden sayılan adımlardan
// (replica/recon.md, "Akışlar") daha fazla tıklama istememeli. Sayaç gerçek fare basışlarını sayar;
// yazı yazmak sayılmaz, ama odak alanda değilse alana tıklamak sayılır. Sonuçlar replica/parity.md içine yazılır.

type Counter = { read: () => number; reset: () => void };

async function countPresses(page: Page): Promise<Counter> {
  let presses = 0;
  await page.exposeFunction("__countPress", () => {
    presses += 1;
  });
  await page.addInitScript(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.isTrusted) void (window as unknown as { __countPress: () => Promise<void> }).__countPress();
      },
      true,
    );
  });
  return { read: () => presses, reset: () => (presses = 0) };
}

/** Gerçek kullanıcı gibi yazar: odak alanda değilse önce tıklar (bu tıklama sayılır). */
async function type(page: Page, field: Locator, text: string) {
  if (!(await field.evaluate((element) => element === document.activeElement))) await field.click();
  await page.keyboard.type(text);
}

const record = (flow: string, presses: number, budget: number | null) =>
  test.info().annotations.push({ type: "tıklama", description: `${flow}: ${presses}${budget === null ? "" : ` (asıl ürün: ${budget})`}` });

test.describe("X tıklama bütçesi", () => {
  test("F02 gelen talebi gelen kutusundan kabul et: en çok 3 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.getByRole("link", { name: new RegExp(`^${t.nav.inbox}`) }).click();
    await page.getByRole("button", { name: /Elif Kaya/ }).click();
    await page.getByRole("button", { name: t.incoming.accept }).click();
    await expect(page.getByRole("region", { name: t.incoming.title })).toHaveCount(0);
    record("F02 gelen kutusundan kabul", counter.read(), 3);
    expect(counter.read()).toBeLessThanOrEqual(3);
  });

  test("F02 gelen talebi panodan kabul et: 2 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.getByRole("button", { name: fill(t.board.cardMenu, { name: "Telegram talebi" }) }).click();
    await page.getByRole("menuitem", { name: t.board.accept }).click();
    await expect(card(column(page, STAGE.first), "Telegram talebi")).toBeVisible();
    record("F02 panodan kabul", counter.read(), 3);
    expect(counter.read()).toBeLessThanOrEqual(2);
  });

  test("F03 lead'i elle oluştur: en çok 4 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.getByRole("button", { name: t.board.addLead }).click();
    const dialog = page.getByRole("dialog", { name: t.newLead.title });
    await type(page, dialog.getByLabel(t.newLead.name), "Tıklama sayımı");
    await dialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(card(column(page, STAGE.first), "Tıklama sayımı")).toBeVisible();
    record("F03 elle lead", counter.read(), 4);
    expect(counter.read()).toBeLessThanOrEqual(4);
  });

  test("F04 lead kartından müşteriye yaz: en çok 2 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await card(page, "Mutfak yenileme").getByRole("link", { name: "Mutfak yenileme" }).click();
    const composer = page.getByRole("textbox", { name: t.chat.composerLabel });
    await expect(composer).toBeVisible();
    await type(page, composer, "Tıklama sayımı mesajı");
    await page.keyboard.press("Control+Enter");
    await expect(feed(page).getByText("Tıklama sayımı mesajı")).toBeVisible();
    record("F04 karttan yazış (Ctrl+Enter ile)", counter.read(), 2);
    expect(counter.read()).toBeLessThanOrEqual(2);
  });

  test("F05 lead'i kart menüsünden bir sonraki aşamaya taşı: 2 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.getByRole("button", { name: fill(t.board.cardMenu, { name: "Mutfak yenileme" }) }).click();
    await page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.offer }) }).click();
    await expect(card(column(page, STAGE.offer), "Mutfak yenileme")).toBeVisible();
    record("F05 menüden taşıma (sürükleme: 1)", counter.read(), 1);
    expect(counter.read()).toBeLessThanOrEqual(2);
  });

  test("F06 lead kartından görev oluştur: en çok 4 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoLead(page, "l-desks");
    counter.reset();
    await page.getByRole("button", { name: t.tasks.add }).first().click();
    const dialog = page.getByRole("dialog", { name: t.tasks.newTitle });
    await type(page, dialog.getByLabel(t.tasks.text), "Tıklama sayımı görevi");
    await dialog.getByRole("button", { name: t.tasks.submit }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: t.tasks.open }).getByText("Tıklama sayımı görevi")).toBeVisible();
    record("F06 görev oluşturma", counter.read(), 4);
    expect(counter.read()).toBeLessThanOrEqual(4);
  });

  test("F10 özel alan ekle: en çok 6 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoLead(page, "l-kitchen");
    counter.reset();
    await page.getByRole("region", { name: t.fields.title }).getByRole("button", { name: t.fields.manage }).click();
    const dialog = page.getByRole("dialog", { name: t.fields.manageTitle.lead });
    await type(page, dialog.getByLabel(t.fields.newName), "Tıklama alanı");
    await dialog.getByRole("button", { name: t.fields.add }).click();
    await expect(dialog.getByLabel(fill(t.fields.nameOf, { name: "Tıklama alanı" }))).toBeVisible();
    record("F10 özel alan (metin)", counter.read(), 6);
    expect(counter.read()).toBeLessThanOrEqual(6);
  });

  test("F11 aşamaya otomasyon ekle: en çok 6 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.getByRole("link", { name: t.nav.automations }).click();
    await page.getByRole("button", { name: fill(t.automations.addFor, { stage: STAGE.incoming }) }).click();
    const dialog = page.getByRole("dialog", { name: t.automations.newTitle });
    await dialog.getByRole("button", { name: t.automations.submit }).click();
    await expect(dialog).toBeHidden();
    record("F11 otomasyon (sırayla dağıtım, varsayılan ayar)", counter.read(), 6);
    expect(counter.read()).toBeLessThanOrEqual(6);
  });

  test("F13 üyenin yetkisini değiştir: 5 tıklama", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.getByRole("link", { name: t.nav.settings }).click();
    await page.getByRole("link", { name: t.settingsNav.users }).click();
    await page.getByRole("button", { name: fill(t.team.editLabel, { name: "Cem Kara" }) }).click();
    const dialog = page.getByRole("dialog", { name: "Cem Kara" });
    await dialog.getByRole("button", { name: t.access.presetFull }).click();
    await dialog.getByRole("button", { name: t.common.save }).click();
    await expect(dialog).toBeHidden();
    record("F13 yetki değiştirme (davet değil)", counter.read(), null);
    expect(counter.read()).toBeLessThanOrEqual(5);
  });

  test("F07 genel arama ile kayda git: fare gerekmez", async ({ page }) => {
    const counter = await countPresses(page);
    await gotoBoard(page);
    counter.reset();
    await page.keyboard.press("Control+k");
    await page.keyboard.type("gömme");
    await expect(page.getByRole("option", { name: /Gömme dolap/ })).toBeVisible();
    await expect(page.getByRole("listbox", { name: t.search.results })).not.toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/leads/`));
    record("F07 genel arama", counter.read(), 2);
    expect(counter.read()).toBe(0);
  });
});
