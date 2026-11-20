import { actAs, card, column, expect, expectNoA11yViolations, fill, gotoBoard, id, STAGE, t, test, WS } from "./support";
import type { APIRequestContext, Page } from "@playwright/test";

// Telegram kanalı, yerel Telegram taklidine (api/dev/telegram) karşı sınanır; gerçek Telegram'a istek gitmez.
const c = t.channels;
const s = t.sources;
const TOKEN = "100200300:DENEME-yerel-taklit-belirteci-0001";
const BOT = "@deneme_100200300_bot";

type Channel = { id: string; kind: string; name: string; status: string; lastEventAt: string | null; lastError: string | null };
type Message = { id: string; body: string; direction: string; status: string; errorCode: string | null };
type Conversation = { id: string; contactName: string; channel: { kind: string; name: string }; leadId: string | null };

const control = async (request: APIRequestContext, data: Record<string, unknown>) => {
  const response = await request.post("/api/dev/telegram/control", { data: { token: TOKEN, ...data } });
  return (await response.json()) as { status?: number; updateId?: number; sent?: Array<{ chatId: string; text: string }>; webhook?: { url: string } | null };
};
const connect = (page: Page, token = TOKEN, ws = WS) => page.request.post(`/api/w/${ws}/channels`, { data: { kind: "telegram", token } });
const channels = async (page: Page) => ((await (await page.request.get(`/api/w/${WS}/channels`)).json()) as { items: Channel[] }).items;
const conversations = async (page: Page) => (await (await page.request.get(`/api/w/${WS}/conversations?status=all`)).json()) as Conversation[];
const messagesOf = async (page: Page, conversationId: string) => (await (await page.request.get(`/api/w/${WS}/conversations/${conversationId}/messages`)).json()) as Message[];
const telegramConversation = async (page: Page, name: string) => (await conversations(page)).find((item) => item.contactName === name)!;
const composer = (page: Page) => page.getByRole("textbox", { name: t.chat.composerLabel });

async function gotoSources(page: Page) {
  await page.goto(`/w/${WS}/sources`);
  await expect(page.getByRole("heading", { name: s.connectedTitle })).toBeVisible();
}

test.describe("F24 Telegram kanalı (yerel Telegram taklidiyle)", () => {
  test("F24-H1 yönetici botu bağlar; bota yazan kişi lead olur, yanıt Telegram'a gider", async ({ page }) => {
    await gotoSources(page);
    await page.getByRole("button", { name: fill(s.connectLabel, { name: s.items.telegram.name }) }).click();
    const dialog = page.getByRole("dialog", { name: fill(c.dialogTitle, { name: t.chat.channel.telegram }) });
    await expect(dialog.getByText(c.telegram.devNotice)).toBeVisible();
    await expectNoA11yViolations(page);
    await dialog.getByRole("button", { name: c.telegram.devFill }).click();
    await dialog.getByRole("button", { name: c.telegram.submit }).click();
    await expect(dialog.getByText(fill(c.done, { name: BOT }))).toBeVisible();
    await dialog.getByRole("button", { name: t.intakes.done }).click();

    // Bağlı kaynaklarda: botun adı, türü, durumu. Belirteç hiçbir yanıtta dönmez.
    const row = page.getByRole("listitem").filter({ hasText: BOT });
    await expect(row.getByText(c.statusConnected, { exact: true })).toBeVisible();
    await expect(row.getByText(c.never)).toBeVisible();
    await expectNoA11yViolations(page);
    const [channel] = await channels(page);
    expect(channel).toMatchObject({ kind: "telegram", name: BOT, status: "connected" });
    expect(JSON.stringify(channel)).not.toContain("DENEME");
    // Bildirim adresi Telegram'a kaydedildi.
    expect((await control(page.request, { action: "webhook" })).webhook?.url).toContain(`/api/hooks/telegram/${channel.id}`);

    // Bir kişi bota yazar.
    const delivered = await control(page.request, { action: "message", chatId: 700123, firstName: "Sena", lastName: "Akın", text: "Merhaba, mutfak dolabı için fiyat alabilir miyim?" });
    expect(delivered.status).toBe(200);
    await gotoBoard(page);
    const lead = card(column(page, STAGE.incoming), "Telegram talebi").filter({ hasText: "Sena Akın" });
    await expect(lead).toContainText("Merhaba, mutfak dolabı için fiyat alabilir miyim?");

    // Gelen kutusundan yanıt: Telegram'a gider, durumu "gönderildi" olur.
    await page.goto(`/w/${WS}/inbox`);
    await page.getByRole("button", { name: /Sena Akın/ }).click();
    await composer(page).fill("Merhaba Sena Hanım, ölçüleri paylaşır mısınız?");
    await composer(page).press("Control+Enter");
    await expect.poll(async () => (await control(page.request, { action: "sent" })).sent).toEqual([{ chatId: "700123", text: "Merhaba Sena Hanım, ölçüleri paylaşır mısınız?", messageId: expect.any(Number) }]);
    const conversation = await telegramConversation(page, "Sena Akın");
    expect(conversation.channel).toMatchObject({ kind: "telegram", name: BOT });
    await expect.poll(async () => (await messagesOf(page, conversation.id)).at(-1)).toMatchObject({ direction: "out", status: "sent", errorCode: null });

    // Kanal sağlığı: son mesajın zamanı yazar.
    await gotoSources(page);
    await expect(page.getByRole("listitem").filter({ hasText: BOT }).getByText(c.never)).toHaveCount(0);
    expect((await channels(page))[0].lastEventAt).not.toBeNull();
  });

  test("F24-E1 aynı güncelleme iki kez gelirse tek mesaj yazılır; grup mesajı atlanır; fotoğraf yer tutucuyla gelir", async ({ page }) => {
    expect((await connect(page)).status()).toBe(201);
    const first = await control(page.request, { action: "message", chatId: 700200, firstName: "Emre", text: "İlk mesaj" });
    // Telegram yanıt alamazsa aynı güncellemeyi yeniden gönderir.
    expect((await control(page.request, { action: "message", chatId: 700200, firstName: "Emre", text: "İlk mesaj", updateId: first.updateId })).status).toBe(200);
    expect((await control(page.request, { action: "message", chatId: -100900, firstName: "Grup", text: "Gruptan mesaj", group: true })).status).toBe(200);
    expect((await control(page.request, { action: "message", chatId: 700200, firstName: "Emre", text: "ölçü fotoğrafı", photo: true })).status).toBe(200);

    const all = await conversations(page);
    expect(all.filter((item) => item.channel.kind === "telegram" && item.channel.name === BOT).map((item) => item.contactName)).toEqual(["Emre"]);
    const conversation = await telegramConversation(page, "Emre");
    expect((await messagesOf(page, conversation.id)).map((message) => message.body)).toEqual(["İlk mesaj", "[Fotoğraf] ölçü fotoğrafı"]);
    // İkinci mesaj yeni lead açmaz.
    await gotoBoard(page);
    await expect(card(column(page, STAGE.incoming), "Telegram talebi").filter({ hasText: "Emre" })).toHaveCount(1);
  });

  test.describe("hatalar ve kurallar", () => {
    test.use({ allow4xx: [400, 401, 403, 404, 409, 422, 502] });

    test("F24-E2 geçersiz belirteç bağlanmaz ve neden söylenir; boş belirteç alan hatası verir", async ({ page }) => {
      await gotoSources(page);
      await page.getByRole("button", { name: fill(s.connectLabel, { name: s.items.telegram.name }) }).click();
      const dialog = page.getByRole("dialog", { name: fill(c.dialogTitle, { name: t.chat.channel.telegram }) });
      await dialog.getByRole("button", { name: c.telegram.submit }).click();
      await expect(dialog.getByText(c.telegram.tokenRequired)).toBeVisible();
      await dialog.getByLabel(new RegExp(`^${c.telegram.token}`)).fill("123456:GECERSIZ-bu-belirtec-taklitte-reddedilir");
      await dialog.getByRole("button", { name: c.telegram.submit }).click();
      await expect(dialog.getByText(t.errors.channel_invalid_token)).toBeVisible();
      await expectNoA11yViolations(page);
      expect(await channels(page)).toEqual([]);
      // Biçime uymayan değer hizmete sorulmadan reddedilir.
      expect((await connect(page, "belirteç değil")).status()).toBe(422);
      expect((await page.request.post(`/api/w/${WS}/channels`, { data: { kind: "faks", token: TOKEN } })).status()).toBe(422);
    });

    test("F24-E3 yanlış gizli değerle gelen bildirim reddedilir ve hiçbir şey yazılmaz; bilinmeyen kanal 404", async ({ page }) => {
      expect((await connect(page)).status()).toBe(201);
      const before = (await conversations(page)).length;
      expect((await control(page.request, { action: "message", chatId: 700300, firstName: "Sahte", text: "Ben Telegram değilim", secret: "yanlis-deger" })).status).toBe(401);
      expect((await conversations(page)).length).toBe(before);
      const [channel] = await channels(page);
      const direct = (path: string, headers: Record<string, string> = {}) => page.request.post(path, { data: { update_id: 1 }, headers });
      expect((await direct(`/api/hooks/telegram/${channel.id}`)).status()).toBe(401);
      expect((await direct(`/api/hooks/telegram/${id("ch-yok")}`, { "x-telegram-bot-api-secret-token": "x" })).status()).toBe(404);
      // Örnek verinin kanalı bildirim kabul etmez: anahtarı yoktur.
      expect((await direct(`/api/hooks/telegram/${id("ch-tg")}`, { "x-telegram-bot-api-secret-token": "x" })).status()).toBe(404);
      expect((await page.request.post(`/api/hooks/telegram/${channel.id}`, { data: "json değil", headers: { "content-type": "text/plain" } })).status()).toBe(400);
    });

    test("F24-E4 kişi botu engellediyse mesaj gönderilemez, nedeni yazar; engel kalkınca yeniden deneme gönderir", async ({ page }) => {
      expect((await connect(page)).status()).toBe(201);
      await control(page.request, { action: "message", chatId: 700400, firstName: "Lale", text: "Fiyat?" });
      await control(page.request, { action: "block", chatId: 700400 });
      await page.goto(`/w/${WS}/inbox`);
      await page.getByRole("button", { name: /Lale/ }).click();
      await composer(page).fill("Fiyat listemiz ektedir");
      await composer(page).press("Control+Enter");
      const failed = page.getByRole("listitem").filter({ hasText: "Fiyat listemiz ektedir" });
      await expect(failed.getByText(`${t.chat.status.failed}: ${t.chat.failReasons.recipient_blocked}`)).toBeVisible();
      await expectNoA11yViolations(page);
      const conversation = await telegramConversation(page, "Lale");
      expect((await messagesOf(page, conversation.id)).at(-1)).toMatchObject({ status: "failed", errorCode: "recipient_blocked" });
      // Kişi engeli kaldırmadan yeniden deneme yine başarısız olur; kanal "koptu" sayılmaz.
      const retryButton = failed.getByRole("button", { name: new RegExp(`^${t.chat.retry}`) });
      const retried = page.waitForResponse((response) => response.url().endsWith("/retry"));
      await retryButton.click();
      expect(((await (await retried).json()) as Message).status).toBe("failed");
      expect((await channels(page))[0].status).toBe("connected");

      await control(page.request, { action: "unblock", chatId: 700400 });
      await expect(retryButton).toBeEnabled();
      await retryButton.click();
      await expect.poll(async () => (await messagesOf(page, conversation.id)).at(-1)).toMatchObject({ status: "sent", errorCode: null });
      await expect(failed.getByRole("button", { name: new RegExp(`^${t.chat.retry}`) })).toHaveCount(0);
      expect((await control(page.request, { action: "sent" })).sent?.map((item) => item.text)).toEqual(["Fiyat listemiz ektedir"]);
      // Gönderilmiş mesaj yeniden denenemez.
      const sent = (await messagesOf(page, conversation.id)).at(-1)!;
      expect((await page.request.post(`/api/w/${WS}/conversations/${conversation.id}/messages/${sent.id}/retry`)).status()).toBe(409);
    });

    test("F24-E5 Telegram'a ulaşılamazsa mesaj hata alır; hizmet dönünce yeniden deneme gönderir. Bağlarken ulaşılamazsa kanal oluşmaz", async ({ page }) => {
      await control(page.request, { action: "down" });
      expect((await connect(page)).status()).toBe(502);
      expect(await channels(page)).toEqual([]);
      await control(page.request, { action: "up" });
      expect((await connect(page)).status()).toBe(201);
      await control(page.request, { action: "message", chatId: 700500, firstName: "Onur", text: "Selam" });
      const conversation = await telegramConversation(page, "Onur");

      await control(page.request, { action: "down" });
      const reply = await page.request.post(`/api/w/${WS}/conversations/${conversation.id}/messages`, { data: { clientToken: crypto.randomUUID(), body: "Yanıt" } });
      expect(((await reply.json()) as Message).status).toBe("failed");
      expect(((await reply.json()) as Message).errorCode).toBe("unreachable");
      await control(page.request, { action: "up" });
      const message = (await messagesOf(page, conversation.id)).at(-1)!;
      const retried = await page.request.post(`/api/w/${WS}/conversations/${conversation.id}/messages/${message.id}/retry`);
      expect(((await retried.json()) as Message).status).toBe("sent");
    });

    test("F24-E6 bağlantı kesilince bildirim adresi kalkar, eski konuşmaya mesaj gitmez; aynı bot yeniden bağlanınca konuşma sürer", async ({ page }) => {
      expect((await connect(page)).status()).toBe(201);
      await control(page.request, { action: "message", chatId: 700600, firstName: "Pelin", text: "Merhaba" });
      const conversation = await telegramConversation(page, "Pelin");
      const [channel] = await channels(page);

      await gotoSources(page);
      await page.getByRole("button", { name: fill(c.disconnectLabel, { name: BOT }) }).click();
      const dialog = page.getByRole("dialog", { name: c.disconnectTitle });
      await expect(dialog.getByText(fill(c.disconnectBody, { name: BOT }))).toBeVisible();
      await expectNoA11yViolations(page);
      await dialog.getByRole("button", { name: c.disconnectConfirm }).click();
      await expect(page.getByText(fill(c.disconnected, { name: BOT }))).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: BOT })).toHaveCount(0);
      expect(await channels(page)).toEqual([]);
      expect((await control(page.request, { action: "webhook" })).webhook).toBeNull();

      // Konuşma geçmişi durur; mesaj gönderilemez ve neden söylenir.
      const reply = await page.request.post(`/api/w/${WS}/conversations/${conversation.id}/messages`, { data: { clientToken: crypto.randomUUID(), body: "Orada mısınız?" } });
      expect((await reply.json()) as Message).toMatchObject({ status: "failed", errorCode: "channel_disconnected" });
      // Eski bildirim adresi artık kabul etmez.
      expect((await page.request.post(`/api/hooks/telegram/${channel.id}`, { data: { update_id: 9 }, headers: { "x-telegram-bot-api-secret-token": "x" } })).status()).toBe(404);

      // Aynı bot yeniden bağlanır: aynı kanal kaydı açılır, kişi yazınca aynı konuşma sürer.
      const again = await connect(page);
      expect(((await again.json()) as Channel).id).toBe(channel.id);
      await control(page.request, { action: "message", chatId: 700600, firstName: "Pelin", text: "Yeniden yazdım" });
      expect((await messagesOf(page, conversation.id)).map((message) => message.body)).toEqual(["Merhaba", "Orada mısınız?", "Yeniden yazdım"]);
    });

    test("F24-N1 üye kanal bağlayamaz ve kesemez; başka çalışma alanına bağlı bot ikinci kez bağlanamaz", async ({ page }) => {
      expect((await connect(page)).status()).toBe(201);
      const [channel] = await channels(page);

      await actAs(page, "u-bora");
      expect((await connect(page, "200300400:BASKA-bir-deneme-belirteci-000002")).status()).toBe(403);
      expect((await page.request.delete(`/api/w/${WS}/channels/${channel.id}`)).status()).toBe(403);
      await gotoSources(page);
      await expect(page.getByRole("listitem").filter({ hasText: BOT })).toBeVisible();
      await expect(page.getByRole("button", { name: fill(c.disconnectLabel, { name: BOT }) })).toHaveCount(0);
      await expect(page.getByRole("button", { name: fill(s.connectLabel, { name: s.items.telegram.name }) })).toHaveCount(0);

      // Diğer çalışma alanının yöneticisi aynı botu bağlayamaz; buradaki bağlantı bozulmaz.
      await actAs(page, "u-can");
      const taken = await connect(page, TOKEN, "diger");
      expect([taken.status(), ((await taken.json()) as { error: { code: string } }).error.code]).toEqual([409, "channel_in_use"]);
      expect((await page.request.delete(`/api/w/diger/channels/${channel.id}`)).status()).toBe(404);
      await actAs(page, null);
      expect((await control(page.request, { action: "webhook" })).webhook?.url).toContain(channel.id);
      expect((await control(page.request, { action: "message", chatId: 700700, firstName: "Arda", text: "Hâlâ çalışıyor mu?" })).status).toBe(200);
      expect((await telegramConversation(page, "Arda")).leadId).not.toBeNull();
    });
  });
});
