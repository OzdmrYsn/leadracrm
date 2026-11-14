import { expect, feed, gotoLead, t, test, u, WS } from "./support";
import type { Page } from "@playwright/test";

type Message = { body: string; direction: string; status: string; clientToken: string | null };

const composer = (page: Page) => page.getByRole("textbox", { name: t.chat.composerLabel });
const sendButton = (page: Page) => page.getByRole("button", { name: t.chat.send, exact: true });
const messages = (api: { get: (path: string) => Promise<unknown> }, conversation = "cv-deniz") =>
  api.get(`/conversations/${conversation}/messages`) as Promise<Message[]>;

test.describe("F04 lead kartından müşteriyle yazış", () => {
  test("F04-H1 Ctrl+Enter ile gönderilen mesaj akışta ve gelen kutusunda görünür", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await composer(page).fill("Ölçü için salı 14:00 uygun mu?");
    await composer(page).press("Control+Enter");
    await expect(feed(page).getByText("Ölçü için salı 14:00 uygun mu?")).toBeVisible();
    await expect(composer(page)).toHaveValue("");

    const sent = (await messages(api)).at(-1)!;
    expect(sent).toMatchObject({ body: "Ölçü için salı 14:00 uygun mu?", direction: "out" });

    await page.goto(`/w/${WS}/inbox`);
    await expect(page.getByRole("button", { name: /Deniz Arslan.*Ölçü için salı 14:00 uygun mu\?/ })).toBeVisible();
  });

  test("F04-H2 Gönder düğmesiyle gönderme", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const before = (await messages(api)).length;
    await composer(page).fill("Düğmeyle gönderilen");
    await sendButton(page).click();
    await expect(feed(page).getByText("Düğmeyle gönderilen")).toBeVisible();
    await expect.poll(async () => (await messages(api)).length).toBe(before + 1);
  });

  test("F04-H3 not yalnız ekibe görünür: akışa eklenir, müşteriye mesaj gitmez", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const before = (await messages(api)).length;
    await page.getByRole("group", { name: t.chat.modeLabel }).getByRole("button", { name: t.chat.modeNote }).click();
    await page.getByRole("textbox", { name: t.chat.notePlaceholder }).fill("Müşteri indirim bekliyor");
    await page.getByRole("button", { name: t.chat.addNote }).click();
    const note = feed(page).getByRole("listitem").filter({ hasText: "Müşteri indirim bekliyor" });
    await expect(note).toContainText(`${t.chat.note} · Ada Yıldız`);
    expect((await messages(api)).length).toBe(before);
  });

  test("F04-H4 gelen kutusundan yanıt aynı konuşmaya düşer ve lead kartında da görünür", async ({ page }) => {
    await page.goto(`/w/${WS}/inbox`);
    await page.getByRole("button", { name: /Deniz Arslan/ }).click();
    await composer(page).fill("Gelen kutusundan yanıt");
    await composer(page).press("Control+Enter");
    await expect(page.getByText("Gelen kutusundan yanıt").filter({ visible: true }).first()).toBeVisible();
    await gotoLead(page, "l-kitchen");
    await expect(feed(page).getByText("Gelen kutusundan yanıt")).toBeVisible();
  });

  test("F04-E1 boş ya da yalnız boşluk olan mesaj gönderilemez", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const before = (await messages(api)).length;
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).fill("   \n  ");
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).press("Control+Enter");
    expect((await messages(api)).length).toBe(before);
  });

  test("F04-E2 çok satırlı, emojili ve aksanlı mesaj olduğu gibi gider", async ({ page, api }) => {
    const body = "Merhaba Deniz Hanım 👋\nİki seçenek var:\n• ığdır taşı\n• çam <b>kalın</b> & \"özel\"";
    await gotoLead(page, "l-kitchen");
    await composer(page).fill(body);
    await composer(page).press("Control+Enter");
    await expect(feed(page).getByText("• ığdır taşı")).toBeVisible();
    // İşaretleme metin olarak görünür, HTML olarak işlenmez.
    await expect(feed(page).getByText("<b>kalın</b>")).toBeVisible();
    expect((await messages(api)).at(-1)!.body).toBe(body);
  });

  test("F04-E3 art arda iki Ctrl+Enter tek mesaj gönderir", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await composer(page).fill("Yalnız bir kez");
    await composer(page).press("Control+Enter");
    await composer(page).press("Control+Enter");
    await expect(feed(page).getByText("Yalnız bir kez")).toHaveCount(1);
    await expect.poll(async () => (await messages(api)).filter((message) => message.body === "Yalnız bir kez").length).toBe(1);
  });

  test("F04-E4 aynı istek iki kez gelirse (ağ yeniden denemesi) mesaj bir kez kaydedilir", async ({ api }) => {
    const clientToken = "3f0c9a52-7d1e-4b8a-9c11-2a6f5e0d7b44";
    const first = await api.post("/conversations/cv-deniz/messages", { body: "Yinelenen istek", clientToken });
    const second = await api.post("/conversations/cv-deniz/messages", { body: "Yinelenen istek", clientToken });
    expect(first.status).toBeLessThan(300);
    expect(second.status).toBeLessThan(300);
    expect(second.body.id).toBe(first.body.id);
    expect((await messages(api)).filter((message) => message.clientToken === clientToken)).toHaveLength(1);
  });

  test("F04-E5 konuşması olmayan lead'de yalnız not eklenebilir ve neden söylenir", async ({ page }) => {
    await gotoLead(page, "l-wardrobe");
    await expect(page.getByText(t.chat.noConversation)).toBeVisible();
    await expect(page.getByRole("group", { name: t.chat.modeLabel })).toHaveCount(0);
    await page.getByRole("textbox", { name: t.chat.notePlaceholder }).fill("Telefonla aranacak");
    await page.getByRole("button", { name: t.chat.addNote }).click();
    await expect(feed(page).getByText("Telefonla aranacak")).toBeVisible();
  });

  test("F04-E6 sınırdan uzun mesaj yazılamaz; 4096 karakterlik mesaj gönderilir", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await composer(page).fill("a".repeat(5000));
    expect((await composer(page).inputValue()).length).toBe(4096);
    await composer(page).press("Control+Enter");
    await expect(composer(page)).toHaveValue("");
    expect((await messages(api)).at(-1)!.body.length).toBe(4096);
  });

  test("F04-E7 gönderim başarısız olursa hata gösterilir, metin kaybolmaz; yeniden denenince tek mesaj gider", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await page.route("**/conversations/*/messages", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await composer(page).fill("Bağlantı koptu denemesi");
    await composer(page).press("Control+Enter");
    await expect(page.getByText(t.chat.sendFailed)).toBeVisible();
    await expect(composer(page)).toHaveValue("Bağlantı koptu denemesi");
    // Gönderilemeyen mesaj akışta "gönderildi" gibi kalmaz.
    await expect(feed(page).getByText("Bağlantı koptu denemesi")).toHaveCount(0);

    await page.unroute("**/conversations/*/messages");
    await composer(page).press("Control+Enter");
    await expect(feed(page).getByText("Bağlantı koptu denemesi")).toHaveCount(1);
    await expect(page.getByText(t.chat.sendFailed)).toHaveCount(0);
    expect((await messages(api)).filter((message) => message.body === "Bağlantı koptu denemesi")).toHaveLength(1);
  });

  test("F04-E8 yavaş ağda mesaj hemen akışta görünür ve gönderiliyor diye işaretlenir", async ({ page }) => {
    await gotoLead(page, "l-kitchen");
    await page.route("**/conversations/*/messages", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await composer(page).fill("Yavaş ağ");
    await composer(page).press("Control+Enter");
    const bubble = feed(page).getByRole("listitem").filter({ hasText: "Yavaş ağ" });
    await expect(bubble).toContainText(t.chat.status.queued);
    await expect(bubble).not.toContainText(t.chat.status.queued, { timeout: 10_000 });
  });

  test("F04-E10 her mesajın kimden olduğu ekran okuyucuya söylenir (gelen mesajda müşteri adı)", async ({ page }) => {
    await gotoLead(page, "l-kitchen");
    const incoming = feed(page).getByRole("listitem").filter({ hasText: "Uygun. Ölçüleri yarın gönderiyorum." });
    await expect(incoming).toContainText("Deniz Arslan");
    const outgoing = feed(page).getByRole("listitem").filter({ hasText: "Harika, bekliyorum." });
    await expect(outgoing).toContainText("Ada Yıldız");
  });

  test("F04-E9 kart açılınca okunmamış mesajlar okunmuş sayılır", async ({ page, api }) => {
    const unread = async () =>
      ((await api.get("/conversations?status=all")) as Array<{ id: string; unreadCount: number }>).find((item) => item.id === "cv-elif")!.unreadCount;
    expect(await unread()).toBeGreaterThan(0);
    await gotoLead(page, "l-elif");
    await expect.poll(unread).toBe(0);
  });

  test("F04-H5 gelen kutusunda konuşma bir ekip üyesine atanır ve ataması kaldırılır", async ({ page, api }) => {
    const assignee = async () =>
      ((await api.get("/conversations?status=all")) as Array<{ id: string; assignedUserId: string | null }>).find((item) => item.id === "cv-elif")!.assignedUserId;
    expect(await assignee()).toBeNull();
    await page.goto(u(`/w/${WS}/inbox?c=cv-elif`));
    const select = page.getByRole("combobox", { name: t.inbox.assigneeLabel });
    await expect(select).toContainText(t.common.unassigned);
    await select.click();
    await page.getByRole("option", { name: "Bora Şahin", exact: true }).click();
    await expect.poll(assignee).toBe("u-bora");
    await expect(select).toContainText("Bora Şahin");
    // Yenileyince kalıcı.
    await page.reload();
    await expect(page.getByRole("combobox", { name: t.inbox.assigneeLabel })).toContainText("Bora Şahin");
    await page.getByRole("combobox", { name: t.inbox.assigneeLabel }).click();
    await page.getByRole("option", { name: t.common.unassigned, exact: true }).click();
    await expect.poll(assignee).toBeNull();
  });

  test.describe("kısıtlı üye", () => {
    test.use({ asUser: "u-cem", allow4xx: [404] });

    test("F04-E11 kapsamı \"kendi\" olan üye konuşmayı başkasına atayınca konuşma listesinden düşer", async ({ page, api }) => {
      await page.goto(u(`/w/${WS}/inbox?c=cv-elif`));
      await page.getByRole("combobox", { name: t.inbox.assigneeLabel }).click();
      await page.getByRole("option", { name: "Bora Şahin", exact: true }).click();
      await expect(page.getByRole("combobox", { name: t.inbox.assigneeLabel })).toHaveCount(0);
      expect((await api.get("/conversations?status=all")) as unknown[]).toEqual([]);
      // Artık göremediği konuşmayı yeniden atayamaz.
      expect((await api.patch("/conversations/cv-elif", { assignedUserId: "u-cem" })).status).toBe(404);
    });
  });

  test.describe("API doğrulaması", () => {
    test.use({ allow4xx: [404, 422] });

    test("F04-N2 konuşma olmayan ya da başka kiracıdaki kullanıcıya atanamaz", async ({ api }) => {
      expect((await api.patch("/conversations/cv-deniz", { assignedUserId: "u-yok" })).status).toBe(404);
      expect((await api.patch("/conversations/cv-deniz", { assignedUserId: "u-can" })).status).toBe(404);
      expect((await api.patch("/conversations/cv-yok", { assignedUserId: "u-bora" })).status).toBe(404);
      expect((await api.patch("/conversations/cv-deniz", {})).status).toBe(422);
    });


    test("F04-N1 geçersiz gönderimler reddedilir: boş gövde, 4097 karakter, olmayan konuşma", async ({ api }) => {
      const token = () => crypto.randomUUID();
      expect((await api.post("/conversations/cv-deniz/messages", { body: "  ", clientToken: token() })).status).toBe(422);
      expect((await api.post("/conversations/cv-deniz/messages", { body: "a".repeat(4097), clientToken: token() })).status).toBe(422);
      expect((await api.post("/conversations/cv-deniz/messages", { body: "x", clientToken: "uuid-degil" })).status).toBe(422);
      expect((await api.post("/conversations/cv-yok/messages", { body: "x", clientToken: token() })).status).toBe(404);
    });
  });
});
