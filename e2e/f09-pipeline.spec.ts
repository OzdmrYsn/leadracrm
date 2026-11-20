import { card, column, expect, fill, gotoBoard, id, STAGE, t, test, WS } from "./support";
import type { Page } from "@playwright/test";

const stageNames = { incoming: "Gelen talepler", open: ["Bir"], won: "Kazanıldı", lost: "Kaybedildi" };

async function openEdit(page: Page) {
  await page.getByRole("button", { name: t.pipeline.menu }).click();
  await page.getByRole("menuitem", { name: t.pipeline.edit }).click();
  const dialog = page.getByRole("dialog", { name: t.pipeline.edit });
  await expect(dialog).toBeVisible();
  return dialog;
}

const columnNames = (page: Page) => page.getByRole("region").getByRole("heading", { level: 3 }).allTextContents();

test.describe("F09 pipeline ve aşamaları kur", () => {
  test("F09-H1 yeni pipeline oluşturulur, panosu açılır ve eklenen lead o pipeline'a düşer", async ({ page, api }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: t.pipeline.menu }).click();
    await page.getByRole("menuitem", { name: t.pipeline.create }).click();
    const dialog = page.getByRole("dialog", { name: t.pipeline.create });
    await dialog.getByLabel(t.pipeline.name).fill("Bayi satışları");
    await dialog.getByRole("button", { name: t.pipeline.createSubmit }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("heading", { name: "Bayi satışları", level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\?p=/);
    expect(await columnNames(page)).toEqual(t.pipeline.defaultStages.open);
    await expect(page.getByRole("article")).toHaveCount(0);

    // Boş panoda iki "Lead ekle" düğmesi vardır: başlıkta ve boş durumda.
    await page.getByRole("banner").getByRole("button", { name: t.board.addLead }).click();
    const leadDialog = page.getByRole("dialog", { name: t.newLead.title });
    await leadDialog.getByLabel(t.newLead.name).fill("Bayi siparişi");
    await leadDialog.getByRole("button", { name: t.newLead.submit }).click();
    await expect(card(column(page, t.pipeline.defaultStages.open[0]), "Bayi siparişi")).toBeVisible();

    const session = await api.get("/session");
    const created = session.pipelines.find((pipeline: { name: string }) => pipeline.name === "Bayi satışları");
    const [lead] = (await api.get(`/leads?q=${encodeURIComponent("Bayi siparişi")}`)) as Array<{ stageId: string }>;
    expect(created.stages.map((stage: { id: string }) => stage.id)).toContain(lead.stageId);

    // Ana pipeline'a dönünce yeni lead orada görünmez.
    await page.getByRole("button", { name: t.pipeline.menu }).click();
    await page.getByRole("menuitem", { name: "Satış", exact: true }).click();
    await expect(column(page, STAGE.talk)).toBeVisible();
    await expect(card(page, "Bayi siparişi")).toHaveCount(0);
  });

  test("F09-H2 aşama ekle, adlandır, sırala ve boş aşamayı sil", async ({ page, api }) => {
    await gotoBoard(page);
    const dialog = await openEdit(page);

    await dialog.getByLabel(t.pipeline.newStageLabel).fill("Sözleşme");
    await dialog.getByRole("button", { name: t.pipeline.addStage }).click();
    await expect(dialog.getByLabel(fill(t.pipeline.stageName, { name: "Sözleşme" }))).toBeVisible();

    const offer = dialog.getByLabel(fill(t.pipeline.stageName, { name: STAGE.offer }));
    await offer.fill("Fiyat teklifi");
    await offer.press("Enter");
    await expect(dialog.getByLabel(fill(t.pipeline.stageName, { name: "Fiyat teklifi" }))).toBeVisible();

    // Yukarı taşıma: ad kaydı sürerken de çalışır, düğme odağı kaybetmez ve art arda iki basış iki kez taşır.
    const up = dialog.getByRole("button", { name: fill(t.pipeline.moveUp, { name: "Sözleşme" }) });
    await up.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(up).toBeFocused();
    const order = async () =>
      (await api.get("/session")).pipelines[0].stages
        .slice()
        .sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort)
        .map((stage: { name: string }) => stage.name);
    await expect.poll(order).toEqual([STAGE.incoming, STAGE.first, "Sözleşme", STAGE.talk, "Fiyat teklifi", STAGE.won, STAGE.lost]);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: t.pipeline.menu })).toBeFocused();
    await expect.poll(() => columnNames(page)).toEqual([STAGE.incoming, STAGE.first, "Sözleşme", STAGE.talk, "Fiyat teklifi"]);

    const again = await openEdit(page);
    await again.getByRole("button", { name: fill(t.pipeline.deleteStage, { name: "Sözleşme" }) }).click();
    await expect(again.getByText(fill(t.pipeline.stageDeleted, { name: "Sözleşme" }))).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect.poll(() => columnNames(page)).toEqual([STAGE.incoming, STAGE.first, STAGE.talk, "Fiyat teklifi"]);
  });

  test("F09-H3 pipeline listede yukarı ve aşağı taşınır; ana pipeline başta kalır", async ({ page, api }) => {
    for (const name of ["Bayi", "İhracat"]) expect((await api.post("/pipelines", { name, stageNames: t.pipeline.defaultStages })).status).toBe(201);
    const names = async () => ((await api.get("/session")).pipelines as Array<{ name: string }>).map((pipeline) => pipeline.name);
    expect(await names()).toEqual(["Satış", "Bayi", "İhracat"]);

    await gotoBoard(page);
    const menu = page.getByRole("button", { name: t.pipeline.menu });
    // Ana pipeline seçiliyken sıralama seçenekleri yoktur.
    await menu.click();
    await expect(page.getByRole("menuitem", { name: t.pipeline.listUp })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "İhracat", exact: true }).click();
    await expect(page.getByRole("heading", { name: "İhracat", level: 1 })).toBeVisible();

    await menu.click();
    await expect(page.getByRole("menuitem", { name: t.pipeline.listDown })).toBeDisabled();
    await page.getByRole("menuitem", { name: t.pipeline.listUp }).click();
    await expect(page.getByRole("status").filter({ hasText: fill(t.pipeline.reordered, { name: "İhracat", position: 2 }) })).toHaveCount(1);
    expect(await names()).toEqual(["Satış", "İhracat", "Bayi"]);

    // Menüdeki sıra da değişir; artık başta olduğu için yukarı taşınamaz.
    await menu.click();
    await expect(page.getByRole("menuitem", { name: t.pipeline.listUp })).toBeDisabled();
    const order = await page.getByRole("menuitem").allInnerTexts();
    expect(order.slice(0, 3).map((text) => text.trim())).toEqual(["Satış", fill(t.pipeline.current, { name: "İhracat" }), "Bayi"]);
  });

  test("F09-E1 lead'i olan aşama silinirken lead'lerin gideceği aşama sorulur ve lead'ler taşınır", async ({ page, api }) => {
    await gotoBoard(page);
    const dialog = await openEdit(page);
    await dialog.getByRole("button", { name: fill(t.pipeline.deleteStage, { name: STAGE.talk }) }).click();
    await expect(dialog.getByText(fill(t.pipeline.deleteMoveBody, { name: STAGE.talk, count: 2 }))).toBeVisible();
    await dialog.getByRole("combobox", { name: t.pipeline.moveTo }).click();
    await page.getByRole("option", { name: STAGE.offer }).click();
    await dialog.getByRole("button", { name: t.pipeline.deleteConfirm }).click();
    await expect(dialog.getByLabel(fill(t.pipeline.stageName, { name: STAGE.talk }))).toHaveCount(0);
    await page.keyboard.press("Escape");

    await expect(column(page, STAGE.talk)).toHaveCount(0);
    await expect(column(page, STAGE.offer).getByRole("article")).toHaveCount(3);
    expect((await api.get("/leads/l-kitchen")).stage.name).toBe(STAGE.offer);
    expect((await api.get("/leads/l-desks")).stage.name).toBe(STAGE.offer);
  });

  test("F09-E2 pipeline adı boşsa oluşturulmaz", async ({ page, api }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: t.pipeline.menu }).click();
    await page.getByRole("menuitem", { name: t.pipeline.create }).click();
    const dialog = page.getByRole("dialog", { name: t.pipeline.create });
    await dialog.getByRole("button", { name: t.pipeline.createSubmit }).click();
    await expect(dialog.getByText(t.pipeline.nameRequired)).toBeVisible();
    expect((await api.get("/session")).pipelines).toHaveLength(1);
  });

  test("F09-E3 gelen talepler anahtarı kapatılınca sütun kalkmaz (içinde lead varken) ama yeni talepler ilk aşamaya düşer", async ({ page, api }) => {
    await gotoBoard(page);
    const dialog = await openEdit(page);
    const toggle = dialog.getByRole("switch", { name: new RegExp(t.pipeline.incomingToggle) });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press("Escape");
    await api.inbound({ externalChatId: "tg-e2e-9", contactName: "Nil Karaca", text: "Merhaba" });
    await expect(column(page, STAGE.first).getByText("Nil Karaca")).toBeVisible({ timeout: 10_000 });
    // Önceden gelmiş talep kaybolmaz.
    await expect(column(page, STAGE.incoming).getByText("Elif Kaya")).toBeVisible();
  });

  test.describe("yönetici olmayan kullanıcı", () => {
    test.use({ asUser: "u-bora", allow4xx: [403] });

    test("F09-E4 yönetici olmayan pipeline'ı düzenleyemez: alanlar kilitli, neden yazıyor, API reddediyor", async ({ page, api }) => {
      await gotoBoard(page);
      const dialog = await openEdit(page);
      await expect(dialog.getByText(t.pipeline.adminOnly)).toBeVisible();
      await expect(dialog.getByLabel(t.pipeline.name)).toBeDisabled();
      await expect(dialog.getByLabel(t.pipeline.newStageLabel)).toBeDisabled();
      await expect(dialog.getByRole("button", { name: fill(t.pipeline.deleteStage, { name: STAGE.talk }) })).toBeDisabled();

      expect((await api.post("/pipelines", { name: "İzinsiz", stageNames })).status).toBe(403);
      expect((await page.request.put(`/api/w/${WS}/pipelines/order`, { data: { pipelineIds: [id("p-sales")] } })).status()).toBe(403);
      expect((await api.patch("/stages/s-talk", { name: "İzinsiz" })).status).toBe(403);
      expect((await api.post("/pipelines/p-main/stages", { name: "İzinsiz" })).status).toBeGreaterThanOrEqual(403);
      expect((await api.get("/session")).pipelines[0].stages.map((stage: { name: string }) => stage.name)).not.toContain("İzinsiz");
    });
  });

  test.describe("sınırlar ve sistem aşamaları (API)", () => {
    test.use({ allow4xx: [404, 409, 422] });

    test("F09-E8 sıralama listesi bütün pipeline'ları tam bir kez içermelidir", async ({ page, api }) => {
      const created = await api.post("/pipelines", { name: "Bayi", stageNames });
      const order = (pipelineIds: string[]) => page.request.put(`/api/w/${WS}/pipelines/order`, { data: { pipelineIds } });
      const main = id("p-sales");
      expect((await order([main])).status()).toBe(422);
      expect((await order([main, main])).status()).toBe(422);
      expect((await order([main, created.body.id, id("p-other")])).status()).toBe(422);
      expect((await order([])).status()).toBe(422);
      // Ana pipeline sona yazılsa da listede başta kalır.
      expect((await order([created.body.id, main])).status()).toBe(200);
      expect(((await api.get("/session")).pipelines as Array<{ name: string }>).map((pipeline) => pipeline.name)).toEqual(["Satış", "Bayi"]);
    });

    test("F09-E5 en çok 50 pipeline", async ({ api }) => {
      for (let index = 2; index <= 50; index += 1) {
        expect((await api.post("/pipelines", { name: `Pipeline ${index}`, stageNames })).status, `pipeline ${index}`).toBe(201);
      }
      const over = await api.post("/pipelines", { name: "Elli birinci", stageNames });
      expect([over.status, over.body.error.code]).toEqual([422, "pipeline_limit"]);
      expect((await api.get("/session")).pipelines).toHaveLength(50);
    });

    test("F09-E6 bir pipeline'da en çok 100 aşama", async ({ api }) => {
      const main = (await api.get("/session")).pipelines[0];
      let status = 201;
      let added = 0;
      while (status === 201 && added < 120) {
        status = (await api.post(`/pipelines/${main.id}/stages`, { name: `Aşama ${added}`, color: 1 })).status;
        if (status === 201) added += 1;
      }
      expect(status).toBe(422);
      expect((await api.get("/session")).pipelines[0].stages).toHaveLength(100);
    });

    test("F09-E7 sistem aşamaları silinemez; son açık aşama silinemez; dolu aşama hedefsiz silinemez", async ({ api }) => {
      const remove = async (stageId: string) => {
        const response = await api.delete(`/stages/${stageId}`);
        return { status: response.status, code: response.status >= 400 ? response.body.error.code : null };
      };
      expect(await remove("s-won")).toEqual({ status: 422, code: "system_stage" });
      expect(await remove("s-in")).toEqual({ status: 422, code: "system_stage" });
      expect(await remove("s-talk")).toEqual({ status: 409, code: "stage_not_empty" });
      expect((await api.patch("/stages/s-in", { name: "Yeni ad" })).body.error.code).toBe("system_stage");

      const created = await api.post("/pipelines", { name: "Tek aşamalı", stageNames });
      const only = created.body.stages.find((stage: { kind: string }) => stage.kind === "open");
      expect(await remove(only.id)).toEqual({ status: 422, code: "last_stage" });
      expect(await remove("s-yok")).toEqual({ status: 404, code: "not_found" });
    });
  });
});
