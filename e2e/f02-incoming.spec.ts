import { actAs, card, column, expect, feed, fill, gotoBoard, gotoLead, STAGE, t, test, u, WS } from "./support";

const chat = { externalChatId: "tg-e2e-1", contactName: "Zeynep Aydın", text: "Merhaba, kitaplık için fiyat alabilir miyim?" };
const LEAD_NAME = "Telegram talebi";

test.describe("F02 gelen mesajı lead'e çevir", () => {
  test("F02-H1 yeni sohbetten gelen mesaj gelen talepler sütununa düşer; kabul edilince ilk aşamaya geçer ve bana atanır", async ({ page, api }) => {
    const inbound = await api.inbound(chat);
    expect(inbound.status).toBe(201);
    const leadId: string = inbound.body.leadId;

    await gotoBoard(page);
    const incoming = column(page, STAGE.incoming);
    await expect(incoming.getByText(chat.contactName)).toBeVisible();
    await expect(incoming.getByText(chat.text)).toBeVisible();

    await gotoLead(page, leadId);
    await expect(feed(page).getByText(chat.text)).toBeVisible();
    await page.getByRole("button", { name: t.incoming.accept }).click();
    await expect(page.getByRole("combobox", { name: t.lead.stage })).toHaveText(STAGE.first);
    await expect(page.getByRole("combobox", { name: t.lead.responsible })).toHaveText("Ada Yıldız");
    await expect(page.getByRole("region", { name: t.incoming.title })).toHaveCount(0);
    await expect(feed(page).getByText(fill(t.event.accepted, { actor: "Ada Yıldız" }))).toBeVisible();

    const detail = await api.get(`/leads/${leadId}`);
    expect(detail.stage.kind).toBe("open");
    expect(detail.lead.responsibleUserId).toBe("u-ada");
    expect(detail.conversation.assignedUserId).toBe("u-ada");
  });

  test("F02-H2 panodaki kart menüsünden kabul", async ({ page, api }) => {
    await gotoBoard(page);
    const incoming = column(page, STAGE.incoming);
    await incoming.getByRole("button", { name: fill(t.board.cardMenu, { name: LEAD_NAME }) }).click();
    await page.getByRole("menuitem", { name: t.board.accept }).click();
    await expect(card(column(page, STAGE.first), LEAD_NAME)).toBeVisible();
    await expect(column(page, STAGE.incoming)).toHaveCount(0);
    // Menüden kabul, karttaki "Kabul et" ile aynı sonucu vermeli: lead ve konuşma kabul edene atanır.
    // Kart ekranda hemen taşınır; kayıt arkadan gelir.
    await expect.poll(async () => (await api.get("/leads/l-elif")).lead.responsibleUserId).toBe("u-ada");
    expect((await api.get("/leads/l-elif")).conversation.assignedUserId).toBe("u-ada");
  });

  test("F02-H3 gelen kutusundan kabul", async ({ page, api }) => {
    await page.goto(`/w/${WS}/inbox`);
    await page.getByRole("button", { name: /Elif Kaya/ }).click();
    await expect(page.getByRole("region", { name: t.incoming.title })).toBeVisible();
    await page.getByRole("button", { name: t.incoming.accept }).click();
    await expect(page.getByRole("region", { name: t.incoming.title })).toHaveCount(0);
    expect((await api.get("/leads/l-elif")).stage.name).toBe(STAGE.first);
  });

  test("F02-E1 aynı sohbetten ikinci mesaj yeni lead açmaz, okunmamış sayısı artar", async ({ page, api }) => {
    const first = await api.inbound(chat);
    const second = await api.inbound({ ...chat, text: "Bir de teslim süresini sorabilir miyim?" });
    expect(second.body.leadId).toBe(first.body.leadId);
    const leads = await api.get<Array<{ id: string }>>("/leads?status=all");
    expect(leads.filter((lead) => lead.id === first.body.leadId)).toHaveLength(1);

    await gotoBoard(page);
    const incoming = column(page, STAGE.incoming);
    await expect(incoming.getByText(chat.contactName)).toHaveCount(1);
    await expect(incoming.getByText("Bir de teslim süresini sorabilir miyim?")).toBeVisible();
    await expect(card(incoming, LEAD_NAME).filter({ hasText: chat.contactName }).getByText(fill(t.board.unread, { count: 2 }))).toBeVisible();
  });

  test("F02-E2 reddet: onay sorulur, lead panodan kalkar, konuşma kapanır ama geçmişi kalır", async ({ page, api }) => {
    await gotoLead(page, "l-elif");
    await page.getByRole("button", { name: t.incoming.decline }).click();
    const dialog = page.getByRole("dialog", { name: t.incoming.declineTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: t.incoming.declineConfirm }).click();

    // Reddedilen lead'in kartında kalınmaz: panoya dönülür.
    await expect(page).toHaveURL(/\/pipelines/);
    await expect(column(page, STAGE.first)).toBeVisible();
    // Next.js önceki sayfayı gizli tutar; bu yüzden yalnız görünen öğelere bakılır.
    await expect(page.getByText("Elif Kaya").filter({ visible: true })).toHaveCount(0);

    const conversations = await api.get<Array<{ id: string; status: string; leadId: string | null }>>("/conversations?status=all");
    const closed = conversations.find((item) => item.id === "cv-elif");
    expect(closed).toMatchObject({ status: "closed", leadId: null });
    const messages = await api.get<unknown[]>("/conversations/cv-elif/messages");
    expect(messages.length).toBeGreaterThan(0);
  });

  test.describe("iki kullanıcı", () => {
    test.use({ allow4xx: [409] });

    test("F02-E3 başka biri önce kabul ettiyse ikinci kabul uyarı verir ve lead ikiye bölünmez", async ({ page, api }) => {
      await gotoLead(page, "l-elif");
      const other = await api.post("/leads/l-elif/accept");
      expect(other.status).toBe(200);
      await page.getByRole("button", { name: t.incoming.accept }).click();
      await expect(page.getByText(t.incoming.alreadyHandled).or(page.getByRole("combobox", { name: t.lead.stage }).filter({ hasText: STAGE.first })).first()).toBeVisible();
      const again = await api.post("/leads/l-elif/accept");
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("already_handled");
    });
  });

  test("F02-E4 gelen talepler aşaması kapalıysa yeni talep doğrudan ilk aşamaya düşer", async ({ page, api }) => {
    const session = await api.get("/session");
    const main = session.pipelines.find((pipeline: { isMain: boolean }) => pipeline.isMain);
    expect((await api.patch(`/pipelines/${main.id}`, { incomingEnabled: false })).status).toBe(200);
    const inbound = await api.inbound(chat);
    await gotoBoard(page);
    await expect(column(page, STAGE.first).getByText(chat.contactName)).toBeVisible();
    expect((await api.get(`/leads/${inbound.body.leadId}`)).stage.name).toBe(STAGE.first);
  });

  test("F02-E5 emoji, aksan ve çok uzun mesaj: önizleme kısalır, kart taşmaz", async ({ page, api }) => {
    const long = "Merhaba 👋 çok acil! Ölçüye özel şömine çevresi, ığdır işi oyma, İstanbul'a teslim. ".repeat(40);
    await api.inbound({ ...chat, text: long });
    await gotoBoard(page);
    const incoming = column(page, STAGE.incoming);
    const item = card(incoming, LEAD_NAME).filter({ hasText: chat.contactName });
    await expect(item).toBeVisible();
    const cardBox = await item.boundingBox();
    const columnBox = await incoming.boundingBox();
    expect(cardBox!.width).toBeLessThanOrEqual(columnBox!.width);
    expect(cardBox!.height).toBeLessThan(260);
  });

  test("F02-E6 reddedilen sohbetten yeniden mesaj gelirse yeni bir talep açılır", async ({ page, api }) => {
    expect((await api.post("/leads/l-elif/decline")).status).toBeLessThan(300);
    const inbound = await api.inbound({ externalChatId: "tg-1001", contactName: "Elif Kaya", text: "Tekrar merhaba" });
    expect(inbound.body.leadId).not.toBe("l-elif");
    await gotoBoard(page);
    await expect(column(page, STAGE.incoming).getByText("Tekrar merhaba")).toBeVisible();
    const conversations = await api.get<Array<{ id: string; status: string }>>("/conversations?status=open");
    expect(conversations.find((item) => item.id === "cv-elif")?.status).toBe("open");
  });

  test("F02-E7 kart açıkken gelen mesaj yenilemeden görünür", async ({ page, api }) => {
    await gotoLead(page, "l-elif");
    await api.inbound({ externalChatId: "tg-1001", contactName: "Elif Kaya", text: "Hâlâ orada mısınız?" });
    await expect(feed(page).getByText("Hâlâ orada mısınız?")).toBeVisible({ timeout: 8_000 });
  });

  test.describe("mevcut lead'e bağlama", () => {
    // Bağlanan talebin lead'i silinir; açık kalan sorguları bir kez 404 görebilir.
    test.use({ allow4xx: [404, 409, 422] });

    type Conversation = { id: string; leadId: string | null; leadIsIncoming: boolean; assignedUserId: string | null; unreadCount: number };
    const conversationOf = async (api: { get: (path: string) => Promise<unknown> }, id: string) =>
      ((await api.get("/conversations?status=all")) as Conversation[]).find((item) => item.id === id)!;

    async function pickTarget(page: import("@playwright/test").Page, query: string, name: RegExp) {
      await page.getByRole("button", { name: t.incoming.link }).click();
      await page.getByRole("searchbox", { name: t.leadPicker.searchLabel }).fill(query);
      await page.getByRole("dialog", { name: t.leadPicker.panel }).getByRole("button", { name }).click();
    }

    test("F02-H4 lead kartından: talep mevcut lead'e bağlanır; konuşma oraya taşınır, talebin lead'i silinir", async ({ page, api }) => {
      await gotoLead(page, "l-elif");
      // Seçici başka bir gelen talebi ya da talebin kendisini önermez.
      await page.getByRole("button", { name: t.incoming.link }).click();
      await page.getByRole("searchbox", { name: t.leadPicker.searchLabel }).fill("Telegram");
      await expect(page.getByText(t.leadPicker.noMatch)).toBeVisible();
      await page.getByRole("searchbox", { name: t.leadPicker.searchLabel }).fill("Ofis");
      await page.getByRole("dialog", { name: t.leadPicker.panel }).getByRole("button", { name: /Ofis masaları/ }).click();

      // Önce sorar; vazgeçilebilir.
      const confirm = page.getByRole("group", { name: t.incoming.link });
      await expect(confirm).toContainText(fill(t.incoming.linkConfirm, { lead: "Ofis masaları" }));
      await confirm.getByRole("button", { name: t.common.cancel }).click();
      await expect(page.getByRole("button", { name: t.incoming.accept })).toBeVisible();

      await pickTarget(page, "Ofis", /Ofis masaları/);
      await page.getByRole("group", { name: t.incoming.link }).getByRole("button", { name: t.incoming.linkSubmit }).click();

      // Hedef lead'in kartı açılır: mesajlar ve olay akışta, talep paneli yok.
      await expect(page).toHaveURL(u(`/w/${WS}/leads/l-desks`));
      await expect(page.getByRole("heading", { name: "Ofis masaları", level: 1 })).toBeVisible();
      await expect(feed(page).getByText("Ölçü almaya gelebilir misiniz?")).toBeVisible();
      await expect(feed(page).getByText(fill(t.event.linkedFrom, { actor: "Ada Yıldız", name: "Elif Kaya" }))).toBeVisible();
      await expect(page.getByRole("region", { name: t.incoming.title })).toHaveCount(0);

      const conversation = await conversationOf(api, "cv-elif");
      expect(conversation).toMatchObject({ leadId: "l-desks", leadIsIncoming: false, assignedUserId: "u-bora" });
      expect((await page.request.get(u(`/api/w/${WS}/leads/l-elif`))).status()).toBe(404);
      const names = ((await api.get("/leads?status=all")) as Array<{ name: string }>).map((lead) => lead.name);
      expect(names).not.toContain(LEAD_NAME);

      // Aynı sohbetten gelen yeni mesaj yeni talep açmaz; bağlanan lead'e düşer.
      const next = await api.inbound({ externalChatId: "tg-1001", contactName: "Elif Kaya", text: "Teşekkürler, bekliyorum." });
      expect(next.body).toMatchObject({ leadId: "l-desks", created: false });
    });

    test("F02-H5 gelen kutusundan bağlama: konuşma seçili kalır, panel kalkar, bağlantı hedef lead'e gider", async ({ page, api }) => {
      await page.goto(u(`/w/${WS}/inbox?c=cv-elif`));
      await expect(page.getByRole("region", { name: t.incoming.title })).toBeVisible();
      await pickTarget(page, "Mutfak", /Mutfak yenileme/);
      await page.getByRole("group", { name: t.incoming.link }).getByRole("button", { name: t.incoming.linkSubmit }).click();
      await expect(page.getByRole("region", { name: t.incoming.title })).toHaveCount(0);
      await expect(page.getByRole("link", { name: t.inbox.openLead })).toHaveAttribute("href", u(`/w/${WS}/leads/l-kitchen`));
      await expect(page.getByRole("list", { name: t.chat.messages }).getByText("Ölçü almaya gelebilir misiniz?")).toBeVisible();
      expect((await conversationOf(api, "cv-elif")).leadId).toBe("l-kitchen");
    });

    test("F02-E8 talepteki not ve görev bağlanan lead'e taşınır", async ({ api }) => {
      expect((await api.post("/notes", { leadId: "l-elif", body: "Bayi olabilir, sorulacak." })).status).toBe(201);
      const due = new Date(Date.now() + 3_600_000).toISOString();
      expect((await api.post("/tasks", { leadId: "l-elif", typeId: "tt-follow", text: "Geri ara", dueAt: due })).status).toBe(201);
      expect((await api.post("/leads/l-elif/link", { targetLeadId: "l-desks" })).status).toBe(200);
      const items = (await api.get("/leads/l-desks/feed")) as Array<{ kind: string; note?: { body: string } }>;
      expect(items.some((item) => item.kind === "note" && item.note?.body === "Bayi olabilir, sorulacak.")).toBe(true);
      const tasks = (await api.get("/tasks?status=all&lead=l-desks")) as Array<{ text: string }>;
      expect(tasks.map((task) => task.text)).toContain("Geri ara");
    });

    test("F02-N2 bağlanamayan hedefler: kendisi, başka bir talep, kapanmış lead, olmayan ve başka kiracının lead'i", async ({ api }) => {
      const other = await api.inbound({ externalChatId: "tg-link-2", contactName: "Başka Talep", text: "Merhaba" });
      for (const [target, status, code] of [
        ["l-elif", 422, "invalid_target"],
        [other.body.leadId, 422, "invalid_target"],
        ["l-yok", 404, "not_found"],
        ["l-other", 404, "not_found"],
      ] as const) {
        const response = await api.post("/leads/l-elif/link", { targetLeadId: target });
        expect(response.status, String(target)).toBe(status);
        expect(response.body.error.code).toBe(code);
      }
      expect((await api.patch("/leads/l-shelf", { stageId: "s-won", expectedStageId: (await api.get("/leads/l-shelf")).lead.stageId })).status).toBe(200);
      expect((await api.post("/leads/l-elif/link", { targetLeadId: "l-shelf" })).body.error.code).toBe("invalid_target");
      // Talep olmayan bir lead bağlanamaz; talep yerinde duruyor.
      expect((await api.post("/leads/l-kitchen/link", { targetLeadId: "l-desks" })).status).toBe(409);
      expect((await api.post("/leads/l-elif/link", {})).status).toBe(422);
      expect((await api.get("/leads/l-elif")).stage.kind).toBe("incoming");
      // Bağlandıktan sonra ikinci deneme: talep artık yok.
      expect((await api.post("/leads/l-elif/link", { targetLeadId: "l-desks" })).status).toBe(200);
      expect((await api.post("/leads/l-elif/link", { targetLeadId: "l-desks" })).status).toBe(404);
    });

    test("F02-N3 kısıtlı üye talebi yalnız görebildiği bir lead'e bağlar; konuşma ona atanır", async ({ page, api }) => {
      await actAs(page, "u-cem");
      expect((await api.post("/leads/l-elif/link", { targetLeadId: "l-kitchen" })).status).toBe(404);
      const mine = await api.post("/leads", { name: "Cem'in lead'i" });
      expect((await api.post("/leads/l-elif/link", { targetLeadId: mine.body.id })).status).toBe(200);
      const conversation = ((await api.get("/conversations?status=all")) as Conversation[]).find((item) => item.leadId === mine.body.id)!;
      expect(conversation.assignedUserId).toBe("u-cem");
      // Lead'in ana kişisi yoktu: yazan kişi ana kişi oldu.
      expect((await api.get(`/leads/${mine.body.id}`)).contact.name).toBe("Elif Kaya");
    });
  });
});
