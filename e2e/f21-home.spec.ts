import { card, column, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, gotoBoard, STAGE, t, test, WS } from "./support";
import type { Page } from "@playwright/test";

const h = t.home;

async function gotoHome(page: Page) {
  await page.goto(`/w/${WS}/home`);
  await expect(page.getByRole("heading", { name: h.pipelineTitle })).toBeVisible();
  await expect(page.locator("#main [aria-busy]")).toHaveCount(0);
}

test.describe("F21 Bugün ekranı ve kazanım kutlaması", () => {
  test("F21-H1 selam, günün özeti, satış hattı şeridi, yapılacaklar ve yanıt bekleyenler", async ({ page }) => {
    await gotoHome(page);
    // Selam günün saatine göre değişir; ad her durumda geçer.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ada");
    await expect(page.getByText(fill(h.summaryUnread, { count: 2 }))).toBeVisible();
    await expect(page.getByText(h.statOpen)).toBeVisible();

    const ribbon = page.getByRole("region", { name: h.pipelineTitle });
    await expect(ribbon.getByRole("listitem").filter({ hasText: STAGE.talk })).toContainText("₺96.000");
    await expect(ribbon.getByRole("listitem").filter({ hasText: STAGE.offer })).toContainText("₺185.000");

    const tasks = page.getByRole("region", { name: h.tasksTitle });
    await expect(tasks.getByRole("listitem").filter({ hasText: "Teklif onayını hatırlat" })).toContainText(h.late);

    const waiting = page.getByRole("region", { name: h.waitingTitle });
    await expect(waiting.getByRole("link", { name: /Elif Kaya/ })).toContainText("Ölçü almaya gelebilir misiniz?");
    await expectNoA11yViolations(page);

    await waiting.getByRole("link", { name: /Elif Kaya/ }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/inbox\\?c=`));
    await expect(page.getByRole("list", { name: t.chat.messages })).toBeVisible();
  });

  test("F21-H2 şeritten panoya, hızlı adımlardan ilgili ekranlara gidilir; telefonda taşma olmaz", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("link", { name: h.openBoard }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/pipelines$`));
    await gotoHome(page);
    await page.getByRole("link", { name: new RegExp(`^${h.actionSource}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/sources$`));

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHome(page);
    await expectNoHorizontalOverflow(page);
    await expectNoA11yViolations(page);
  });

  test("F21-E1 yeni çalışma alanında boş durumlar yol gösterir", async ({ page, context }) => {
    await context.clearCookies();
    const created = await page.request.post("/api/auth/signup", { data: { name: "Yeni Kişi", email: "yeni@ornek.test", password: "uzun-bir-sifre", workspaceName: "Boş Atölye" } });
    expect(created.status()).toBe(201);
    await page.goto("/w/bos-atolye/home");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Yeni");
    await expect(page.getByText(h.summaryClear)).toBeVisible();
    await expect(page.getByText(h.tasksEmptyTitle)).toBeVisible();
    await expect(page.getByText(h.waitingEmptyTitle)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("F21-H3 lead kazanıldı olarak kapatılınca pano bunu kutlar ve duyurur", async ({ page }) => {
    await gotoBoard(page);
    await card(column(page, STAGE.talk), "Mutfak yenileme").getByRole("button", { name: fill(t.board.cardMenu, { name: "Mutfak yenileme" }) }).click();
    await page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.won }) }).click();
    await expect(page.getByRole("status").filter({ hasText: fill(t.board.moved, { name: "Mutfak yenileme", stage: STAGE.won }) })).toHaveCount(1);
    // Şerit süstür (ekran okuyucuya duyuru durum satırından gider); adı ve tutarı gösterir, kendiliğinden kaybolur.
    const banner = page.getByText(t.board.wonBanner, { exact: true });
    await expect(banner).toBeVisible();
    await expect(page.getByText("Mutfak yenileme · ₺64.000")).toBeVisible();
    await expect(card(column(page, STAGE.talk), "Mutfak yenileme")).toHaveCount(0);
    await expectNoA11yViolations(page);
    await expect(banner).toHaveCount(0, { timeout: 8000 });
  });
});
