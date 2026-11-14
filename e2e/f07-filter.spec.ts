import { card, column, expect, gotoBoard, STAGE, t, test, WS } from "./support";
import type { Page } from "@playwright/test";

const search = (page: Page) => page.getByRole("searchbox", { name: t.filter.searchLabel });
const quick = (page: Page, name: string) => page.getByRole("group", { name: t.filter.quick }).getByRole("button", { name, exact: true });
const cards = (page: Page) => page.getByRole("article");
const rows = (page: Page) => page.getByRole("row").filter({ has: page.getByRole("rowheader") });

async function gotoList(page: Page) {
  await page.goto(`/w/${WS}/leads`);
  await expect(page.getByRole("table")).toBeVisible();
}

async function openPanel(page: Page) {
  await page.getByRole("search", { name: t.filter.label }).getByRole("button", { name: new RegExp(`^${t.filter.more}`) }).click();
  const panel = page.getByRole("dialog", { name: t.filter.panel });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("F07 ara ve filtrele", () => {
  test("F07-H1 arama lead, kişi ve şirket adında büyük/küçük harf ayırmadan bulur", async ({ page }) => {
    await gotoBoard(page);
    await search(page).fill("KUZEY");
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, "Mutfak yenileme")).toBeVisible();
    await search(page).fill("okan");
    await expect(card(page, "Gömme dolap, üç oda")).toBeVisible();
    await expect(cards(page)).toHaveCount(1);
    await search(page).fill("  ");
    await expect(cards(page)).toHaveCount(5);
  });

  test("F07-H2 hızlı süzgeçler: benim, görevsiz, okunmamış", async ({ page }) => {
    await gotoBoard(page);
    await quick(page, t.filter.mine).click();
    await expect(quick(page, t.filter.mine)).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page)).toHaveCount(3);
    await expect(column(page, STAGE.incoming)).toHaveCount(0);
    await quick(page, t.filter.mine).click();

    await quick(page, t.filter.noTask).click();
    await expect(cards(page)).toHaveCount(2);
    await expect(card(page, "Ofis masaları")).toBeVisible();
    await expect(card(page, "Telegram talebi")).toBeVisible();
    await quick(page, t.filter.noTask).click();

    await quick(page, t.filter.unread).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, "Telegram talebi")).toBeVisible();
  });

  test("F07-H3 liste: durum süzgeci ve sütuna göre sıralama", async ({ page }) => {
    await gotoList(page);
    await expect(rows(page)).toHaveCount(5);
    const status = page.getByRole("group", { name: t.filter.status.label });
    await status.getByRole("button", { name: t.filter.status.won }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Kitaplık", exact: true })).toBeVisible();
    await status.getByRole("button", { name: t.filter.status.all }).click();
    await expect(rows(page)).toHaveCount(6);

    const price = page.getByRole("columnheader", { name: t.leads.colPrice });
    await price.getByRole("button").click();
    await expect(price).toHaveAttribute("aria-sort", "ascending");
    await expect(rows(page).first()).toContainText("Telegram talebi");
    await price.getByRole("button").click();
    await expect(price).toHaveAttribute("aria-sort", "descending");
    await expect(rows(page).first()).toContainText("₺185.000");

    const name = page.getByRole("columnheader", { name: t.leads.colName, exact: true });
    await name.getByRole("button").click();
    await expect(name).toHaveAttribute("aria-sort", "ascending");
    await expect(price).not.toHaveAttribute("aria-sort", /.+/);
    await expect(rows(page).first()).toContainText("Aksoy Mimarlık");
  });

  test("F07-H4 süzgeç paneli: etiket, sorumlu ve oluşturulma tarihi", async ({ page }) => {
    await gotoBoard(page);
    let panel = await openPanel(page);
    await panel.getByRole("checkbox", { name: "VIP" }).check();
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, "Mutfak yenileme")).toBeVisible();
    await panel.getByRole("checkbox", { name: "Acil" }).check();
    // Seçili etiketlerden en az birini taşıyanlar.
    await expect(cards(page)).toHaveCount(2);
    await panel.getByRole("checkbox", { name: "VIP" }).uncheck();
    await panel.getByRole("checkbox", { name: "Acil" }).uncheck();

    await panel.getByRole("combobox", { name: t.filter.responsible }).click();
    await page.getByRole("option", { name: "Bora Şahin" }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, "Ofis masaları")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: t.filter.clear }).first().click();
    await expect(cards(page)).toHaveCount(5);

    // Dünden önce oluşturulanlar: bugün gelen talep dışarıda kalır.
    const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(Date.now() - 86_400_000);
    panel = await openPanel(page);
    await panel.getByLabel(t.filter.createdTo).fill(yesterday);
    await expect(card(page, "Telegram talebi")).toHaveCount(0);
    await expect(card(page, "Mutfak yenileme")).toBeVisible();
    await panel.getByLabel(t.filter.createdTo).fill("");
    await panel.getByLabel(t.filter.createdFrom).fill(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(Date.now()));
    await expect(cards(page)).toHaveCount(1);
    await expect(card(page, "Telegram talebi")).toBeVisible();
  });

  test("F07-E1 sonuç yoksa boş durum gösterilir ve tek tıkla temizlenir", async ({ page }) => {
    await gotoBoard(page);
    await search(page).fill("böyle bir lead yok");
    await expect(page.getByText(t.filter.filteredEmptyTitle)).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await page.getByRole("button", { name: t.filter.clear }).first().click();
    await expect(search(page)).toHaveValue("");
    await expect(cards(page)).toHaveCount(5);
  });

  test("F07-E2 Türkçe harfler: I/ı ve İ/i ayrımı aramayı bozmaz", async ({ page }) => {
    await gotoList(page);
    await page.getByRole("group", { name: t.filter.status.label }).getByRole("button", { name: t.filter.status.all }).click();
    for (const query of ["KİTAPLIK", "kitaplik", "KITAPLIK", "kıtaplık"]) {
      await search(page).fill(query);
      await expect(rows(page), `arama: ${query}`).toHaveCount(2);
    }
    await search(page).fill("GÖMME DOLAP, ÜÇ");
    await expect(rows(page)).toHaveCount(1);
  });

  test("F07-E3 özel karakterler ve işaretleme içeren arama hata vermez", async ({ page }) => {
    await gotoBoard(page);
    for (const query of ["%", "' OR 1=1 --", "<script>alert(1)</script>", "\\", "💥", "a".repeat(300)]) {
      await search(page).fill(query);
      await expect(page.getByText(t.filter.filteredEmptyTitle), `arama: ${query.slice(0, 20)}`).toBeVisible();
    }
    await search(page).fill("");
    await expect(cards(page)).toHaveCount(5);
  });

  test("F07-E4 süzgeçler birlikte uygulanır (benim ve görevsiz: sonuç yok)", async ({ page }) => {
    await gotoBoard(page);
    await quick(page, t.filter.mine).click();
    await quick(page, t.filter.noTask).click();
    await expect(page.getByText(t.filter.filteredEmptyTitle)).toBeVisible();
    await quick(page, t.filter.noTask).click();
    await search(page).fill("aksoy");
    await expect(cards(page)).toHaveCount(1);
  });

  test("F07-E5 art arda hızlı tıklanan iki süzgeç birbirini ezmez", async ({ page }) => {
    await gotoBoard(page);
    // Arada ekranın yeniden çizilmesi beklenmeden iki tıklama.
    await quick(page, t.filter.mine).click({ noWaitAfter: true });
    await quick(page, t.filter.noTask).click({ noWaitAfter: true });
    await expect(quick(page, t.filter.mine)).toHaveAttribute("aria-pressed", "true");
    await expect(quick(page, t.filter.noTask)).toHaveAttribute("aria-pressed", "true");
  });

  test("F07-E6 süzgeçliyken taşınan kart doğru sütunda kalır ve süzgeç korunur", async ({ page }) => {
    await gotoBoard(page);
    await quick(page, t.filter.mine).click();
    await page.getByRole("button", { name: "Mutfak yenileme için işlemler" }).click();
    await page.getByRole("menuitem", { name: "Teklif aşamasına taşı" }).click();
    await expect(card(column(page, STAGE.offer), "Mutfak yenileme")).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await expect(quick(page, t.filter.mine)).toHaveAttribute("aria-pressed", "true");
  });
});
