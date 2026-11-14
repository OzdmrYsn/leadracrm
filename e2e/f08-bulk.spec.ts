import type { Page } from "@playwright/test";
import { actAs, choose, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, t, test, u, WS } from "./support";

type Summary = { id: string; name: string; stageId: string; responsible: { id: string } | null; tags: Array<{ name: string }> };

const FULL = { view: "all", edit: "all", add: true, delete: "all", export: "all" };
const full = { leads: FULL, contacts: FULL, companies: FULL, tasks: { view: "all", edit: "all", delete: "all" }, inbox: { view: "all" } };

const row = (page: Page, name: string) => page.getByRole("checkbox", { name: fill(t.bulk.selectOne, { name }) });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: t.bulk.label });
const leadsOf = async (api: { get: (path: string) => Promise<unknown> }) => (await api.get("/leads?status=all")) as Summary[];
const byName = (leads: Summary[], name: string) => leads.find((lead) => lead.name === name)!;

async function gotoList(page: Page) {
  await page.goto(`/w/${WS}/leads`);
  await expect(page.getByRole("table")).toBeVisible();
}

test.describe("F08 Toplu işlem", () => {
  test("F08-H1 seçili lead'lerin sorumlusu toplu değişir; her lead'in akışına yazılır", async ({ page, api }) => {
    await gotoList(page);
    await expect(toolbar(page)).toHaveCount(0);
    await row(page, "Mutfak yenileme").click();
    await row(page, "Gömme dolap, üç oda").click();
    await expect(toolbar(page)).toContainText(fill(t.bulk.selected, { count: 2 }));

    await toolbar(page).getByRole("button", { name: t.bulk.responsible }).click();
    const dialog = page.getByRole("dialog", { name: t.bulk.responsibleTitle });
    await expect(dialog).toContainText(fill(t.bulk.body, { count: 2 }));
    await choose(page, t.bulk.newResponsible, "Bora Şahin");
    await dialog.getByRole("button", { name: t.bulk.apply }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(fill(t.bulk.done, { count: 2 }))).toBeVisible();
    // Seçim temizlenir, araç çubuğu kalkar.
    await expect(toolbar(page)).toHaveCount(0);
    await expect(row(page, "Mutfak yenileme")).not.toBeChecked();

    const leads = await leadsOf(api);
    expect(byName(leads, "Mutfak yenileme").responsible?.id).toBe("u-bora");
    expect(byName(leads, "Gömme dolap, üç oda").responsible?.id).toBe("u-bora");
    expect(byName(leads, "Ofis masaları").responsible?.id).toBe("u-bora");
    expect(byName(leads, "Aksoy Mimarlık toplantı odası için özel üretim masa ve kitaplık takımı").responsible?.id).toBe("u-ada");
    const feed = (await api.get("/leads/l-kitchen/feed")) as Array<{ kind: string; event?: { type: string; to: string } }>;
    expect(feed.some((item) => item.event?.type === "responsible_changed" && item.event.to === "Bora Şahin")).toBe(true);
  });

  test("F08-H2 toplu aşama değişimi: her lead taşınır ve yeni aşamanın tetikleyicisi her biri için çalışır", async ({ page, api }) => {
    expect(
      (await api.post("/automations", { stageId: "s-offer", onEvent: "stage_entered", kind: "edit_tags", settings: { add: ["t-urgent"], remove: [] } })).status,
    ).toBe(201);
    await gotoList(page);
    await row(page, "Mutfak yenileme").click();
    await row(page, "Ofis masaları").click();
    await toolbar(page).getByRole("button", { name: t.bulk.stage }).click();
    const dialog = page.getByRole("dialog", { name: t.bulk.stageTitle });
    // Hedef seçilmeden uygulanamaz.
    await expect(dialog.getByRole("button", { name: t.bulk.apply })).toBeDisabled();
    await choose(page, t.bulk.newStage, "Teklif");
    await dialog.getByRole("button", { name: t.bulk.apply }).click();
    await expect(page.getByText(fill(t.bulk.done, { count: 2 }))).toBeVisible();

    const leads = await leadsOf(api);
    for (const name of ["Mutfak yenileme", "Ofis masaları"]) {
      expect(byName(leads, name).stageId, name).toBe("s-offer");
      expect(byName(leads, name).tags.map((tag) => tag.name), name).toContain("Acil");
    }
  });

  test("F08-H3 toplu etiket: seçilen etiket eklenir, seçilen kaldırılır; diğer etiketlere dokunulmaz", async ({ page, api }) => {
    const before = byName(await leadsOf(api), "Mutfak yenileme").tags.map((tag) => tag.name).sort();
    expect(before).toEqual(["Bayi", "VIP"]);
    await gotoList(page);
    await row(page, "Mutfak yenileme").click();
    await row(page, "Ofis masaları").click();
    await toolbar(page).getByRole("button", { name: t.bulk.tags }).click();
    const dialog = page.getByRole("dialog", { name: t.bulk.tagsTitle });
    // Hiçbir etiket seçilmeden uygulanmaz.
    await dialog.getByRole("button", { name: t.bulk.apply }).click();
    await expect(dialog.getByText(t.bulk.nothingChosen)).toBeVisible();
    await dialog.getByRole("group", { name: t.bulk.addTags }).getByRole("checkbox", { name: "Acil" }).click();
    await dialog.getByRole("group", { name: t.bulk.removeTags }).getByRole("checkbox", { name: "Bayi" }).click();
    // Aynı etiket hem eklenip hem kaldırılamaz.
    await expect(dialog.getByRole("group", { name: t.bulk.removeTags }).getByRole("checkbox", { name: "Acil" })).toBeDisabled();
    await dialog.getByRole("button", { name: t.bulk.apply }).click();
    await expect(page.getByText(fill(t.bulk.done, { count: 2 }))).toBeVisible();

    const leads = await leadsOf(api);
    expect(byName(leads, "Mutfak yenileme").tags.map((tag) => tag.name).sort()).toEqual(["Acil", "VIP"]);
    expect(byName(leads, "Ofis masaları").tags.map((tag) => tag.name)).toContain("Acil");
  });

  test.describe("silme ve atlananlar", () => {
    test.use({ allow4xx: [403, 404, 422] });

    test("F08-H4 toplu silme onay ister; lead'ler listeden ve panodan kalkar", async ({ page, api }) => {
      await gotoList(page);
      await row(page, "Ofis masaları").click();
      await row(page, "Gömme dolap, üç oda").click();
      await toolbar(page).getByRole("button", { name: t.bulk.delete }).click();
      const dialog = page.getByRole("dialog", { name: fill(t.bulk.deleteTitle, { count: 2 }) });
      await expect(dialog).toContainText(t.bulk.deleteBody);
      // Vazgeçince hiçbir şey silinmez, seçim durur.
      await dialog.getByRole("button", { name: t.common.cancel }).click();
      await expect(row(page, "Ofis masaları")).toBeChecked();
      await toolbar(page).getByRole("button", { name: t.bulk.delete }).click();
      await page.getByRole("dialog").getByRole("button", { name: t.bulk.deleteConfirm }).click();
      await expect(page.getByText(fill(t.bulk.deleted, { count: 2 }))).toBeVisible();
      await expect(row(page, "Ofis masaları")).toHaveCount(0);
      await expect(row(page, "Mutfak yenileme")).toBeVisible();
      expect((await page.request.get(u(`/api/w/${WS}/leads/l-desks`))).status()).toBe(404);
      expect((await leadsOf(api)).map((lead) => lead.name)).not.toContain("Gömme dolap, üç oda");
    });

    test("F08-N1 yetkisi yetmeyen lead'ler atlanır, nedeni söylenir ve seçili kalır", async ({ page, api }) => {
      // Cem bütün lead'leri görür ama yalnız kendininkini düzenler.
      expect((await api.patch("/members/u-cem", { rights: { ...full, leads: { ...FULL, edit: "own", delete: "own" } } })).status).toBe(200);
      await actAs(page, "u-cem");
      const mine = await api.post("/leads", { name: "Cem'in lead'i" });
      expect(mine.status).toBe(201);

      await gotoList(page);
      await row(page, "Cem'in lead'i").click();
      await row(page, "Mutfak yenileme").click();
      await toolbar(page).getByRole("button", { name: t.bulk.stage }).click();
      await choose(page, t.bulk.newStage, "Teklif");
      await page.getByRole("dialog").getByRole("button", { name: t.bulk.apply }).click();
      const skipped = fill(t.bulk.skipped, { count: 1, reasons: t.bulk.reasons.no_permission });
      await expect(page.getByText(`${fill(t.bulk.done, { count: 1 })} ${skipped}`)).toBeVisible();
      await expect(row(page, "Mutfak yenileme")).toBeChecked();
      await expect(row(page, "Cem'in lead'i")).not.toBeChecked();

      const leads = await leadsOf(api);
      expect(byName(leads, "Cem'in lead'i").stageId).toBe("s-offer");
      // Başkasının lead'i yerinde kaldı.
      expect(byName(leads, "Mutfak yenileme")).toMatchObject({ stageId: "s-talk", responsible: { id: "u-ada" } });
      const denied = await api.post("/leads/bulk", { ids: ["l-kitchen", mine.body.id], action: { kind: "delete" } });
      expect(denied.body).toMatchObject({ done: 1, skipped: [{ id: "l-kitchen", reason: "no_permission" }] });
    });

    test("F08-N2 geçersiz hedefler hiçbir lead'e dokunmaz; başka pipeline'ın aşaması ve olmayan lead atlanır", async ({ api }) => {
      const ids = ["l-kitchen", "l-desks"];
      expect((await api.post("/leads/bulk", { ids: [], action: { kind: "delete" } })).status).toBe(422);
      expect((await api.post("/leads/bulk", { ids: Array.from({ length: 201 }, (_, index) => `x-${index}`), action: { kind: "delete" } })).status).toBe(422);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "responsible", userId: "u-yok" } })).status).toBe(404);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "responsible", userId: "u-can" } })).status).toBe(404);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "stage", stageId: "s-in" } })).status).toBe(422);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "stage", stageId: "s-other-open" } })).status).toBe(404);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "tags", add: ["t-yok"], remove: [] } })).status).toBe(404);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "tags", add: [], remove: [] } })).status).toBe(422);
      expect((await api.post("/leads/bulk", { ids, action: { kind: "sat" } })).status).toBe(422);
      const untouched = await leadsOf(api);
      expect(byName(untouched, "Mutfak yenileme")).toMatchObject({ stageId: "s-talk", responsible: { id: "u-ada" } });

      // Başka kiracının ve olmayan lead: atlanır, diğeri uygulanır. Aynı kimlik iki kez gelirse bir kez işlenir.
      const mixed = await api.post("/leads/bulk", { ids: ["l-kitchen", "l-kitchen", "l-other", "l-yok"], action: { kind: "responsible", userId: null } });
      expect(mixed.status).toBe(200);
      expect(mixed.body.done).toBe(1);
      expect(mixed.body.skipped.map((item: { reason: string }) => item.reason)).toEqual(["not_found", "not_found"]);
      expect(byName(await leadsOf(api), "Mutfak yenileme").responsible).toBeNull();

      // İkinci pipeline'ın aşamasına taşıma: bu pipeline'daki lead'ler atlanır.
      const second = await api.post("/pipelines", { name: "Bayi satışları", stageNames: { incoming: "Gelen", open: ["Yeni"], won: "Kazanıldı", lost: "Kaybedildi" } });
      expect(second.status).toBe(201);
      const target = second.body.stages.find((stage: { kind: string }) => stage.kind === "open");
      const moved = await api.post("/leads/bulk", { ids, action: { kind: "stage", stageId: target.id } });
      expect(moved.body).toMatchObject({ done: 0, skipped: [{ reason: "invalid_stage" }, { reason: "invalid_stage" }] });
    });
  });

  test("F08-E1 seçim: tümünü seç, ara durum, klavye, süzgeçle daralma ve temizleme", async ({ page }) => {
    await gotoList(page);
    const all = page.getByRole("checkbox", { name: t.bulk.selectAll });
    await row(page, "Mutfak yenileme").focus();
    await page.keyboard.press("Space");
    await expect(row(page, "Mutfak yenileme")).toBeChecked();
    await expect(all).toHaveAttribute("aria-checked", "mixed");
    await all.click();
    await expect(toolbar(page)).toContainText(fill(t.bulk.selected, { count: 5 }));
    await expect(all).toBeChecked();

    // Süzgeç listeyi daraltınca seçim de görünen lead'lerle sınırlanır.
    await page.getByRole("searchbox", { name: t.filter.searchLabel }).fill("mutfak");
    await expect(toolbar(page)).toContainText(fill(t.bulk.selected, { count: 1 }));
    await toolbar(page).getByRole("button", { name: t.bulk.clear }).click();
    await expect(toolbar(page)).toHaveCount(0);
    await expect(row(page, "Mutfak yenileme")).not.toBeChecked();
  });

  test("F08-E2 erişilebilirlik ve dar ekran: araç çubuğu ve pencere", async ({ page }) => {
    await gotoList(page);
    await row(page, "Mutfak yenileme").click();
    await expectNoA11yViolations(page);
    await toolbar(page).getByRole("button", { name: t.bulk.tags }).click();
    await expect(page.getByRole("dialog", { name: t.bulk.tagsTitle })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await expect(toolbar(page).getByRole("button", { name: t.bulk.tags })).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
  });
});
