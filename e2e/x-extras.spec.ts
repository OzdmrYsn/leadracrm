import type { Page } from "@playwright/test";
import { actAs, card, choose, column, expect, expectNoA11yViolations, fill, gotoBoard, gotoLead, STAGE, t, test, u, WS } from "./support";

type Summary = { id: string; name: string; stageId: string; tags: Array<{ name: string }> };
type Conversation = { id: string; status: string; unreadCount: number };

const leadsOf = async (api: { get: (path: string) => Promise<unknown> }, status = "all") => (await api.get(`/leads?status=${status}`)) as Summary[];
const conversation = async (api: { get: (path: string) => Promise<unknown> }, id: string) => ((await api.get("/conversations?status=all")) as Conversation[]).find((item) => item.id === id)!;
const statusFilter = (page: Page, name: string) => page.getByRole("group", { name: t.filter.status.label }).getByRole("button", { name, exact: true });

async function gotoList(page: Page) {
  await page.goto(`/w/${WS}/leads`);
  await expect(page.getByRole("table")).toBeVisible();
}

test.describe("F05 Kayıp nedeni", () => {
  test("F05-H5 panoda kaybedildi olarak kapatılan lead'in nedeni sorulur ve kaydedilir; atlanabilir", async ({ page, api }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: fill(t.board.cardMenu, { name: "Mutfak yenileme" }) }).click();
    await page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.lost }) }).click();
    const dialog = page.getByRole("dialog", { name: t.board.lossTitle });
    await expect(dialog).toContainText("Mutfak yenileme");
    await expectNoA11yViolations(page);
    await expect(dialog.getByRole("button", { name: t.common.save })).toBeDisabled();
    await choose(page, t.lead.lossReason, "Fiyat yüksek geldi");
    await dialog.getByRole("button", { name: t.common.save }).click();
    await expect(dialog).toBeHidden();
    expect((await api.get("/leads/l-kitchen")).lead.lossReasonId).toBe("lr-price");

    // Atlanırsa neden boş kalır.
    await page.getByRole("button", { name: fill(t.board.cardMenu, { name: "Ofis masaları" }) }).click();
    await page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.lost }) }).click();
    await page.getByRole("dialog", { name: t.board.lossTitle }).getByRole("button", { name: t.board.lossSkip }).click();
    expect((await api.get("/leads/l-desks")).lead).toMatchObject({ stageId: "s-lost", lossReasonId: null });
    // Kazanılan lead için sorulmaz.
    await page.getByRole("button", { name: fill(t.board.cardMenu, { name: "Gömme dolap, üç oda" }) }).click();
    await page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.won }) }).click();
    await expect(card(column(page, STAGE.first), "Gömme dolap, üç oda")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: t.board.lossTitle })).toHaveCount(0);
  });

  test.describe("lead kartı ve kurallar", () => {
    test.use({ allow4xx: [403, 404, 422] });

    test("F05-E7 neden lead kartında görünür ve değişir; lead yeniden açılınca silinir; kaybedilmemiş lead'e neden yazılamaz", async ({ page, api }) => {
      expect((await api.patch("/leads/l-kitchen", { stageId: "s-lost", expectedStageId: "s-talk", lossReasonId: "lr-rival" })).status).toBe(200);
      await gotoLead(page, "l-kitchen");
      const reason = page.getByRole("combobox", { name: t.lead.lossReason });
      await expect(reason).toContainText("Başka firmayı seçti");
      await reason.click();
      await page.getByRole("option", { name: "Yanıt vermedi", exact: true }).click();
      await expect.poll(async () => (await api.get("/leads/l-kitchen")).lead.lossReasonId).toBe("lr-silent");

      // Yeniden açılan lead'in nedeni silinir; alan kartta görünmez.
      expect((await api.patch("/leads/l-kitchen", { stageId: "s-talk", expectedStageId: "s-lost" })).status).toBe(200);
      expect((await api.get("/leads/l-kitchen")).lead.lossReasonId).toBeNull();
      await page.reload();
      await expect(page.getByRole("region", { name: t.lead.details })).toBeVisible();
      await expect(page.getByRole("combobox", { name: t.lead.lossReason })).toHaveCount(0);

      expect((await api.patch("/leads/l-kitchen", { lossReasonId: "lr-price" })).status).toBe(422);
      const before = (await api.get("/leads/l-desks")).lead.stageId;
      expect((await api.patch("/leads/l-desks", { stageId: "s-lost", expectedStageId: before, lossReasonId: "lr-yok" })).status).toBe(404);
      expect((await api.get("/leads/l-desks")).lead.stageId).toBe(before);
    });

    test("F05-E8 yönetici nedenleri ayarlardan ekler, adlandırır, siler; silinen neden lead'lerden kalkar; üye değiştiremez", async ({ page, api }) => {
      expect((await api.patch("/leads/l-kitchen", { stageId: "s-lost", expectedStageId: "s-talk", lossReasonId: "lr-need" })).status).toBe(200);
      await page.goto(`/w/${WS}/settings/workspace`);
      await page.getByLabel(t.lossReasons.newName).fill("Stokta yok");
      await page.getByRole("button", { name: t.lossReasons.add }).click();
      const name = page.getByRole("textbox", { name: fill(t.lossReasons.nameOf, { name: "Stokta yok" }) });
      await name.fill("Stok bekleniyor");
      await name.press("Enter");
      await expect(page.getByRole("textbox", { name: fill(t.lossReasons.nameOf, { name: "Stok bekleniyor" }) })).toBeVisible();
      await page.getByRole("button", { name: fill(t.lossReasons.remove, { name: "İhtiyaç kalmadı" }) }).click();
      await page.getByRole("button", { name: t.lossReasons.removeConfirm }).click();
      await expect(page.getByRole("textbox", { name: fill(t.lossReasons.nameOf, { name: "İhtiyaç kalmadı" }) })).toHaveCount(0);
      const names = (await api.get("/session")).lossReasons.map((item: { name: string }) => item.name);
      expect(names).toEqual(["Fiyat yüksek geldi", "Başka firmayı seçti", "Yanıt vermedi", "Stok bekleniyor"]);
      expect((await api.get("/leads/l-kitchen")).lead).toMatchObject({ stageId: "s-lost", lossReasonId: null });

      await actAs(page, "u-bora");
      expect((await api.post("/loss-reasons", { name: "İzinsiz" })).status).toBe(403);
      expect((await api.patch("/loss-reasons/lr-price", { name: "İzinsiz" })).status).toBe(403);
      await page.goto(`/w/${WS}/settings/workspace`);
      await expect(page.getByText("Fiyat yüksek geldi")).toBeVisible();
      await expect(page.getByLabel(t.lossReasons.newName)).toHaveCount(0);
    });
  });
});

test.describe("F03 Çöp kutusu", () => {
  test.use({ allow4xx: [403, 404] });

  test("F03-E9 silinen lead çöp kutusunda görünür ve geri alınır; silme yetkisi olmayan geri alamaz", async ({ page, api }) => {
    expect((await api.delete("/leads/l-desks")).status).toBe(204);
    await gotoList(page);
    await expect(page.getByRole("link", { name: "Ofis masaları" })).toHaveCount(0);
    await statusFilter(page, t.filter.status.deleted).click();
    // Çöp kutusunda satır bağlantı değildir, seçim kutusu yoktur.
    await expect(page.getByRole("rowheader", { name: "Ofis masaları" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ofis masaları" })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: t.bulk.selectAll })).toBeHidden();
    await expectNoA11yViolations(page);

    await actAs(page, "u-cem");
    expect((await api.post("/leads/l-desks/restore")).status).toBe(404);
    await actAs(page, null);
    expect((await api.post("/leads/l-kitchen/restore")).status).toBe(404);

    await page.getByRole("button", { name: fill(t.leads.restoreLabel, { name: "Ofis masaları" }) }).click();
    await expect(page.getByText(fill(t.leads.restored, { name: "Ofis masaları" }))).toBeVisible();
    await expect(page.getByText(t.leads.trashEmptyTitle)).toBeVisible();
    await statusFilter(page, t.filter.status.open).click();
    await expect(page.getByRole("link", { name: "Ofis masaları" })).toBeVisible();
    expect((await api.get("/leads/l-desks")).lead.deletedAt).toBeNull();
  });

  test("F03-N4 görebildiği ama silme yetkisi olmayan üye çöp kutusundan geri alamaz", async ({ page, api }) => {
    const FULL = { view: "all", edit: "all", add: true, delete: "none", export: "none" };
    expect((await api.patch("/members/u-cem", { rights: { leads: FULL, contacts: FULL, companies: FULL, tasks: { view: "all", edit: "all", delete: "none" }, inbox: { view: "all" } } })).status).toBe(200);
    expect((await api.delete("/leads/l-desks")).status).toBe(204);
    await actAs(page, "u-cem");
    expect((await leadsOf(api, "deleted")).map((lead) => lead.name)).toEqual(["Ofis masaları"]);
    const denied = await api.post("/leads/l-desks/restore");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("no_permission");
  });
});

test.describe("S45 Etiket yönetimi", () => {
  test.use({ allow4xx: [403, 404] });

  test("S45-H1 yönetici etiketin rengini değiştirir, etiketi siler ve yenisini ekler; kullanım sayısı görünür", async ({ page, api }) => {
    await gotoList(page);
    await page.getByRole("button", { name: t.transfer.more }).click();
    await page.getByRole("menuitem", { name: t.tags.manage }).click();
    const dialog = page.getByRole("dialog", { name: t.tags.manageTitle });
    const row = (name: string) => dialog.getByRole("listitem").filter({ hasText: name });
    await expect(row("VIP")).toContainText(fill(t.tags.usage, { count: 1 }));
    await expectNoA11yViolations(page);

    await dialog.getByRole("radiogroup", { name: fill(t.tags.colorOf, { name: "Bayi" }) }).getByRole("radio", { name: t.colors[4] }).click();
    await expect.poll(async () => ((await api.get("/tags")) as Array<{ name: string; color?: number }>).find((tag) => tag.name === "Bayi")!.color).toBe(4);

    await dialog.getByRole("button", { name: fill(t.tags.delete, { name: "VIP" }) }).click();
    await expect(dialog.getByText(fill(t.tags.deleteBody, { name: "VIP", count: 1 }))).toBeVisible();
    await dialog.getByRole("button", { name: t.tags.deleteConfirm }).click();
    await expect(row("VIP")).toHaveCount(0);
    const kitchen = (await leadsOf(api)).find((lead) => lead.name === "Mutfak yenileme")!;
    expect(kitchen.tags.map((tag) => tag.name)).toEqual(["Bayi"]);

    await dialog.getByLabel(t.tags.newName, { exact: true }).fill("Toptan");
    await dialog.getByRole("button", { name: t.tags.add }).click();
    await expect(row("Toptan")).toContainText(fill(t.tags.usage, { count: 0 }));
  });

  test("S45-N1 yönetici olmayan üye etiketleri görür ama silemez, renklendiremez", async ({ page, api }) => {
    await actAs(page, "u-bora");
    await gotoList(page);
    await page.getByRole("button", { name: t.transfer.more }).click();
    await page.getByRole("menuitem", { name: t.tags.manage }).click();
    const dialog = page.getByRole("dialog", { name: t.tags.manageTitle });
    await expect(dialog.getByText(t.tags.adminOnly)).toBeVisible();
    await expect(dialog.getByText("VIP", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: fill(t.tags.delete, { name: "VIP" }) })).toHaveCount(0);
    expect((await api.delete("/tags/t-vip")).status).toBe(403);
    expect((await api.patch("/tags/t-vip", { color: 2 })).status).toBe(403);
    await actAs(page, null);
    expect((await api.delete("/tags/t-yok")).status).toBe(404);
  });
});

test.describe("F04 Konuşmayı kapatma", () => {
  test("F04-H6 konuşma kapatılır: açık listeden çıkar, \"Tümü\"nde kapalı görünür; yeniden açılır", async ({ page, api }) => {
    await page.goto(u(`/w/${WS}/inbox?c=cv-deniz`));
    await page.getByRole("button", { name: t.inbox.close }).click();
    await expect.poll(async () => (await conversation(api, "cv-deniz")).status).toBe("closed");
    // Açık konuşmalar listesinden çıkar; konuşma ekranda kalır ve "Kapalı" diye işaretlenir.
    const list = page.getByRole("navigation", { name: t.inbox.list }).or(page.getByRole("region", { name: t.inbox.list })).first();
    await expect(list.getByRole("button", { name: /Deniz Arslan/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Deniz Arslan" }).getByText(t.inbox.closed)).toBeVisible();
    await page.getByRole("button", { name: t.inbox.reopen }).click();
    await expect.poll(async () => (await conversation(api, "cv-deniz")).status).toBe("open");
    await expect(list.getByRole("button", { name: /Deniz Arslan/ })).toBeVisible();
  });

  test("F04-E12 kapalı ya da reddedilmiş konuşmaya müşteri yeniden yazınca konuşma açılır", async ({ api }) => {
    // Reddedilen talep konuşmayı kapatır.
    expect((await api.post("/leads/l-elif/decline")).status).toBe(204);
    expect((await conversation(api, "cv-elif")).status).toBe("closed");
    const again = await api.inbound({ externalChatId: "tg-1001", contactName: "Elif Kaya", text: "Tekrar merhaba" });
    expect(again.body.created).toBe(true);
    expect(await conversation(api, "cv-elif")).toMatchObject({ status: "open", unreadCount: 1 });
    // Açık konuşmalar listesinde yeniden görünür.
    expect(((await api.get("/conversations?status=open")) as Conversation[]).map((item) => item.id)).toContain("cv-elif");
  });
});

test.describe("F07 Kayıtlı süzgeçler", () => {
  test.use({ allow4xx: [404, 422] });

  test("F07-H7 süzgeç adlandırılıp kaydedilir, sonra tek tıkla uygulanır ve silinir; süzgeçler kişiseldir", async ({ page, api }) => {
    await gotoList(page);
    const saved = () => page.getByRole("dialog", { name: t.saved.panel });
    await page.getByRole("button", { name: t.saved.button }).click();
    // Süzgeç yokken kaydedilemez.
    await expect(saved().getByText(t.saved.none)).toBeVisible();
    await expect(saved().getByLabel(t.saved.name)).toBeDisabled();
    await expect(saved().getByText(t.saved.hint)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("searchbox", { name: t.filter.searchLabel }).fill("mutfak");
    await page.getByRole("group", { name: t.filter.quick }).getByRole("button", { name: t.filter.mine }).click();
    await page.getByRole("button", { name: t.saved.button }).click();
    await saved().getByLabel(t.saved.name).fill("Benim mutfaklarım");
    await saved().getByRole("button", { name: t.saved.save }).click();
    await expect(saved().getByRole("button", { name: fill(t.saved.apply, { name: "Benim mutfaklarım" }) })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");

    // Süzgeç temizlenir; kayıtlı olan uygulanınca arama ve hızlı süzgeç geri gelir.
    await page.getByRole("button", { name: t.filter.clear }).click();
    await expect(page.getByRole("searchbox", { name: t.filter.searchLabel })).toHaveValue("");
    await page.getByRole("button", { name: t.saved.button }).click();
    await saved().getByRole("button", { name: fill(t.saved.apply, { name: "Benim mutfaklarım" }) }).click();
    await expect(page.getByRole("searchbox", { name: t.filter.searchLabel })).toHaveValue("mutfak");
    await expect(page.getByRole("group", { name: t.filter.quick }).getByRole("button", { name: t.filter.mine })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: fill(t.leads.count, { count: 1 }) })).toBeVisible();

    // Yenileyince de durur; panoda da aynı liste görünür.
    await gotoBoard(page);
    await page.getByRole("button", { name: t.saved.button }).click();
    await saved().getByRole("button", { name: fill(t.saved.apply, { name: "Benim mutfaklarım" }) }).click();
    await expect(page.getByRole("article")).toHaveCount(1);

    // Başka kullanıcı bu süzgeci göremez ve silemez.
    const [mine] = (await api.get("/saved-filters")) as Array<{ id: string; name: string }>;
    await actAs(page, "u-bora");
    expect(await api.get("/saved-filters")).toEqual([]);
    expect((await api.delete(`/saved-filters/${mine.id}`)).status).toBe(404);
    await actAs(page, null);

    await page.getByRole("button", { name: t.saved.button }).click();
    await saved().getByRole("button", { name: fill(t.saved.remove, { name: "Benim mutfaklarım" }) }).click();
    await expect(saved().getByText(t.saved.none)).toBeVisible();
  });

  test("F07-N5 kayıtlı süzgeç sınırları: en çok 30 süzgeç, ad zorunlu, bozuk içerik ekranı bozmaz", async ({ page, api }) => {
    expect((await api.post("/saved-filters", { name: " ", criteria: {} })).status).toBe(422);
    expect((await api.post("/saved-filters", { name: "Büyük", criteria: { query: "x".repeat(5000) } })).status).toBe(422);
    // Tanınmayan alanlar ve yanlış türler: uygulayınca varsayılana döner.
    expect((await api.post("/saved-filters", { name: "Bozuk", criteria: { status: "olmayan", tagIds: "dizi değil", noTask: "evet", fazla: 1 } })).status).toBe(201);
    for (let index = 0; index < 29; index += 1) expect((await api.post("/saved-filters", { name: `Süzgeç ${index}`, criteria: { noTask: true } })).status).toBe(201);
    const over = await api.post("/saved-filters", { name: "Otuz birinci", criteria: {} });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("filter_limit");

    await gotoList(page);
    await page.getByRole("button", { name: t.saved.button }).click();
    await page.getByRole("dialog", { name: t.saved.panel }).getByRole("button", { name: fill(t.saved.apply, { name: "Bozuk" }) }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: fill(t.leads.count, { count: 5 }) })).toBeVisible();
  });
});
