import { card, choose, column, expect, feed, fill, gotoBoard, gotoLead, id, STAGE, t, test, WS } from "./support";
import type { Locator, Page } from "@playwright/test";

const menuOf = (page: Page, name: string) => page.getByRole("button", { name: fill(t.board.cardMenu, { name }) });
const moveItem = (page: Page, stage: string) => page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage }) });

/** Kartı fareyle hedefe sürükler (dnd-kit 6 piksel hareketten sonra sürüklemeyi başlatır). */
async function drag(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height - 10;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
  const to = (await target.boundingBox())!;
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 200), { steps: 15 });
  await page.mouse.up();
}

test.describe("F05 lead'i aşamalarda ilerlet ve kapat", () => {
  test("F05-H1 kart menüsünden taşıma: kart yeni sütunda, sayı ve toplam güncel, olay akışta", async ({ page, api }) => {
    await gotoBoard(page);
    await menuOf(page, "Mutfak yenileme").click();
    await moveItem(page, STAGE.offer).click();

    const offer = column(page, STAGE.offer);
    await expect(card(offer, "Mutfak yenileme")).toBeVisible();
    await expect(offer).toContainText(fill(t.board.leadCount, { count: 2 }));
    await expect(offer).toContainText("₺249.000");
    await expect(column(page, STAGE.talk)).toContainText(fill(t.board.leadCount, { count: 1 }));
    await expect(page.getByRole("status").filter({ hasText: fill(t.board.moved, { name: "Mutfak yenileme", stage: STAGE.offer }) })).toHaveCount(1);
    expect((await api.get("/leads/l-kitchen")).stage.name).toBe(STAGE.offer);

    await gotoLead(page, "l-kitchen");
    await expect(feed(page).getByText(fill(t.event.stageChanged, { actor: "Ada Yıldız", from: STAGE.talk, to: STAGE.offer }))).toBeVisible();
  });

  test("F05-H2 sürükle-bırak ile başka aşamaya taşıma", async ({ page, api }) => {
    await gotoBoard(page);
    await drag(page, card(page, "Ofis masaları"), column(page, STAGE.first));
    await expect(card(column(page, STAGE.first), "Ofis masaları")).toBeVisible();
    await expect.poll(async () => (await api.get("/leads/l-desks")).stage.name).toBe(STAGE.first);
  });

  test("F05-H3 lead kartından kazanıldı olarak kapatma: rozet görünür, panodan kalkar, kazanılanlar listesine girer", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await choose(page, t.lead.stage, STAGE.won);
    await expect(page.getByRole("banner").getByText(t.lead.closedWon)).toBeVisible();
    const detail = await api.get("/leads/l-kitchen");
    expect(detail.stage.kind).toBe("won");
    expect(detail.lead.closedAt).not.toBeNull();

    await gotoBoard(page);
    await expect(card(page, "Mutfak yenileme")).toHaveCount(0);
    await page.goto(`/w/${WS}/leads`);
    await page.getByRole("group", { name: t.filter.status.label }).getByRole("button", { name: t.filter.status.won }).click();
    await expect(page.getByRole("link", { name: "Mutfak yenileme" })).toBeVisible();
  });

  test("F05-H4 sürüklerken çıkan kapatma bölgesine bırakınca lead kaybedildi olarak kapanır", async ({ page, api }) => {
    await gotoBoard(page);
    const source = card(page, "Ofis masaları");
    const from = (await source.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height - 10);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height, { steps: 4 });
    const zone = page.getByRole("group", { name: t.board.closeZones }).getByText(t.board.dropLost);
    await expect(zone).toBeVisible();
    const to = (await zone.boundingBox())!;
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(card(page, "Ofis masaları")).toHaveCount(0);
    await expect.poll(async () => (await api.get("/leads/l-desks")).stage.kind).toBe("lost");
  });

  test("F05-E3 yalnız klavyeyle taşıma: menüyü aç, ok tuşuyla seç, Enter", async ({ page, api }) => {
    await gotoBoard(page);
    await menuOf(page, "Gömme dolap, üç oda").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await moveItem(page, STAGE.talk).focus();
    await page.keyboard.press("Enter");
    await expect(card(column(page, STAGE.talk), "Gömme dolap, üç oda")).toBeVisible();
    // Kart ekranda hemen taşınır; kayıt arkadan gelir.
    await expect.poll(async () => (await api.get("/leads/l-wardrobe")).stage.name).toBe(STAGE.talk);
  });

  test("F05-E4 kapanmış lead yeniden açılabilir", async ({ page, api }) => {
    await gotoLead(page, "l-shelf");
    await expect(page.getByRole("banner").getByText(t.lead.closedWon)).toBeVisible();
    await choose(page, t.lead.stage, STAGE.first);
    await expect(page.getByRole("banner").getByText(t.lead.closedWon)).toHaveCount(0);
    const detail = await api.get("/leads/l-shelf");
    expect(detail.stage.kind).toBe("open");
    expect(detail.lead.closedAt).toBeNull();
    await gotoBoard(page);
    await expect(card(column(page, STAGE.first), "Kitaplık")).toBeVisible();
  });

  test("F05-E5 taşıma sayfa yenilenince de yerinde durur", async ({ page }) => {
    await gotoBoard(page);
    await menuOf(page, "Ofis masaları").click();
    await moveItem(page, STAGE.offer).click();
    await expect(card(column(page, STAGE.offer), "Ofis masaları")).toBeVisible();
    await page.reload();
    await expect(card(column(page, STAGE.offer), "Ofis masaları")).toBeVisible();
  });

  test.describe("çakışma ve geçersiz taşıma", () => {
    test.use({ allow4xx: [409, 422] });

    test("F05-E1 iki kullanıcı aynı kartı taşırsa ikincisi uyarılır ve pano güncellenir", async ({ page, api }) => {
      await gotoBoard(page);
      await expect(card(column(page, STAGE.talk), "Mutfak yenileme")).toBeVisible();
      // Bu sekme eski durumda kalsın diye panonun yenilenmesi geciktirilir.
      await page.route("**/pipelines/*/board*", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue().catch(() => undefined);
      });
      const other = await api.patch("/leads/l-kitchen", { stageId: "s-offer", expectedStageId: "s-talk" });
      expect(other.status).toBe(200);

      await menuOf(page, "Mutfak yenileme").click();
      await moveItem(page, STAGE.first).click();
      await expect(page.getByText(fill(t.board.moveConflict, { name: "Mutfak yenileme" }))).toBeVisible();
      await page.unroute("**/pipelines/*/board*");
      await expect(card(column(page, STAGE.offer), "Mutfak yenileme")).toBeVisible();
      expect((await api.get("/leads/l-kitchen")).stage.name).toBe(STAGE.offer);
    });

    test("F05-E2 lead kartında aşama başka sekmede değiştiyse uyarı çıkar ve güncel aşama gösterilir", async ({ page, api }) => {
      await gotoLead(page, "l-kitchen");
      await page.route(`**/api/w/demo/leads/${id("l-kitchen")}`, async (route) => {
        if (route.request().method() === "GET") await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue().catch(() => undefined);
      });
      expect((await api.patch("/leads/l-kitchen", { stageId: "s-offer", expectedStageId: "s-talk" })).status).toBe(200);
      await choose(page, t.lead.stage, STAGE.first);
      await expect(page.getByText(t.lead.stageConflict)).toBeVisible();
      await page.unroute(`**/api/w/demo/leads/${id("l-kitchen")}`);
      await expect(page.getByRole("combobox", { name: t.lead.stage })).toHaveText(STAGE.offer);
    });

    test("F05-E6 gelen talepler aşamasına geri taşınamaz; başka pipeline'ın aşamasına da", async ({ api }) => {
      const back = await api.patch("/leads/l-kitchen", { stageId: "s-in", expectedStageId: "s-talk" });
      expect(back.status).toBe(422);
      expect(back.body.error.code).toBe("invalid_stage");
      const created = await api.post("/pipelines", { name: "İkinci", stageNames: { incoming: "Gelen", open: ["Bir"], won: "Kazanıldı", lost: "Kaybedildi" } });
      expect(created.status).toBe(201);
      const foreign = created.body.stages.find((stage: { kind: string }) => stage.kind === "open");
      const cross = await api.patch("/leads/l-kitchen", { stageId: foreign.id, expectedStageId: "s-talk" });
      expect(cross.status).toBe(422);
      expect((await api.get("/leads/l-kitchen")).stage.name).toBe(STAGE.talk);
    });
  });

  test("F05-E7 lead kartında gelen talepler aşaması seçenek olarak sunulmaz", async ({ page }) => {
    await gotoLead(page, "l-kitchen");
    await page.getByRole("combobox", { name: t.lead.stage }).click();
    await expect(page.getByRole("option", { name: STAGE.offer })).toBeVisible();
    await expect(page.getByRole("option", { name: STAGE.incoming })).toHaveCount(0);
  });
});
