import { card, column, expect, expectNoA11yViolations, feed, fill, gotoBoard, gotoLead, id, STAGE, t, test, u, WS } from "./support";
import type { Page } from "@playwright/test";

const a = t.automations;

async function gotoAutomations(page: Page) {
  await page.goto(`/w/${WS}/automations`);
  await expect(page.getByRole("heading", { name: a.triggersTitle })).toBeVisible();
  await expect(page.locator("#main [aria-busy]")).toHaveCount(0);
}

const roundRobin = (stageId: string, userIds: string[]) => ({ stageId, onEvent: "lead_created", kind: "change_responsible", settings: { mode: "round_robin", userIds } });

test.describe("F11 aşamaya otomasyon ekle", () => {
  test("F11-H1 sırayla dağıtım ekrandan kurulur; gelen talepler ekip üyelerine sırayla atanır", async ({ page, api }) => {
    await gotoAutomations(page);
    await page.getByRole("button", { name: fill(a.addFor, { stage: STAGE.incoming }) }).click();
    const dialog = page.getByRole("dialog", { name: a.newTitle });
    await expect(dialog).toContainText(fill(a.stageLine, { stage: STAGE.incoming }));
    await expectNoA11yViolations(page);
    // Gelen talepler aşamasına lead taşınamaz: yalnız "oluşturuldu" olayı sunulur.
    await dialog.getByRole("combobox", { name: a.when }).click();
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await dialog.getByRole("checkbox", { name: "Cem Kara" }).click();
    await dialog.getByRole("button", { name: a.submit }).click();
    await expect(dialog).toBeHidden();
    const summary = fill(a.summary.roundRobin, { names: "Ada Yıldız, Bora Şahin" });
    await expect(page.getByText(summary)).toBeVisible();
    await expect(page.getByRole("button", { name: fill(a.addFor, { stage: STAGE.incoming }) })).toBeFocused();

    const owners: string[] = [];
    let firstLead = "";
    for (let index = 0; index < 4; index += 1) {
      const inbound = await api.inbound({ externalChatId: `tg-rr-${index}`, contactName: `Müşteri ${index}`, text: "Merhaba" });
      firstLead ||= inbound.body.leadId;
      const detail = await api.get(`/leads/${inbound.body.leadId}`);
      owners.push(detail.lead.responsibleUserId);
      // Konuşma da aynı kişiye atanır.
      expect(detail.conversation.assignedUserId).toBe(detail.lead.responsibleUserId);
    }
    expect(owners).toEqual(["u-ada", "u-bora", "u-ada", "u-bora"]);

    await page.goto(u(`/w/${WS}/leads/${firstLead}`));
    await expect(feed(page).getByText(fill(t.event.responsibleChanged, { actor: t.event.byAutomation, to: "Ada Yıldız" }))).toBeVisible();
  });

  test("F11-H2 lead aşamaya taşınınca görev eklenir; görev lead'in sorumlusuna düşer", async ({ page, api }) => {
    const created = await api.post("/automations", {
      stageId: "s-offer",
      onEvent: "stage_entered",
      kind: "add_task",
      settings: { typeId: "tt-follow", text: "Teklifi gönder", dueInMinutes: 1440, responsible: "lead" },
    });
    expect(created.status).toBe(201);

    await gotoBoard(page);
    await page.getByRole("button", { name: fill(t.board.cardMenu, { name: "Ofis masaları" }) }).click();
    await page.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.offer }) }).click();
    await expect(card(column(page, STAGE.offer), "Ofis masaları")).toBeVisible();

    await expect.poll(async () => ((await api.get("/tasks?status=open&lead=l-desks")) as unknown[]).length).toBe(1);
    const [task] = (await api.get("/tasks?status=open&lead=l-desks")) as Array<{ text: string; dueAt: string; responsible: { id: string } }>;
    expect(task.text).toBe("Teklifi gönder");
    expect(task.responsible.id).toBe("u-bora");
    const hours = (Date.parse(task.dueAt) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);

    await gotoLead(page, "l-desks");
    await expect(feed(page).getByText(fill(t.event.taskAdded, { actor: t.event.byAutomation, task: "Teklifi gönder" }))).toBeVisible();
    // Oluşturma olayı için kurulmuş bir tetikleyici taşımada çalışmaz, taşıma olayı için kurulan da oluşturmada.
    const lead = await api.post("/leads", { name: "Doğrudan teklifte", stageId: "s-offer" });
    expect(((await api.get(`/tasks?status=open&lead=${lead.body.id}`)) as unknown[]).length).toBe(0);
  });

  test("F11-H3 tetikleyici ekrandan kapatılır, düzenlenir ve silinir", async ({ page, api }) => {
    const created = await api.post("/automations", { stageId: "s-first", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: "s-talk" } });
    await gotoAutomations(page);
    const before = fill(a.summary.stage, { stage: STAGE.talk });
    const toggle = page.getByRole("switch", { name: fill(a.activeLabel, { summary: before }) });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect.poll(async () => ((await api.get("/automations")) as Array<{ id: string; isActive: boolean }>).find((item) => item.id === created.body.id)?.isActive).toBe(false);

    // Kapalı tetikleyici çalışmaz.
    await api.patch("/leads/l-office", { stageId: "s-first", expectedStageId: "s-offer" });
    expect((await api.get("/leads/l-office")).stage.name).toBe(STAGE.first);

    await page.getByRole("button", { name: fill(a.edit, { summary: before }) }).click();
    const dialog = page.getByRole("dialog", { name: a.editTitle });
    await dialog.getByRole("combobox", { name: a.action }).click();
    await page.getByRole("option", { name: a.kinds.edit_tags }).click();
    await dialog.getByRole("group", { name: a.tagsAdd }).getByRole("checkbox", { name: "VIP" }).click();
    await dialog.getByRole("button", { name: t.common.save }).click();
    await expect(dialog).toBeHidden();
    const after = fill(a.summary.tagsAdd, { names: "VIP" });
    await expect(page.getByText(after)).toBeVisible();

    await page.getByRole("button", { name: fill(a.remove, { summary: after }) }).click();
    const confirm = page.getByRole("dialog", { name: a.removeBody });
    await confirm.getByRole("button", { name: a.removeConfirm }).click();
    await expect(page.getByText(after)).toHaveCount(0);
    expect(((await api.get("/automations")) as unknown[]).length).toBe(0);
  });

  test("F11-H4 zincir: taşıma başka bir taşımayı, o da etiketlemeyi tetikler; her adım akışa yazılır", async ({ page, api }) => {
    expect((await api.post("/automations", { stageId: "s-first", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: "s-talk" } })).status).toBe(201);
    expect((await api.post("/automations", { stageId: "s-talk", onEvent: "stage_entered", kind: "edit_tags", settings: { add: ["t-vip"], remove: ["t-urgent"] } })).status).toBe(201);
    expect((await api.post("/automations", { stageId: "s-talk", onEvent: "stage_entered", kind: "change_responsible", settings: { mode: "user", userId: "u-bora" } })).status).toBe(201);

    const moved = await api.patch("/leads/l-office", { stageId: "s-first", expectedStageId: "s-offer" });
    expect(moved.status).toBe(200);
    // Yanıt, tetikleyiciler çalıştıktan sonraki hâli taşır.
    expect(moved.body.stageId).toBe("s-talk");
    expect(moved.body.responsibleUserId).toBe("u-bora");
    const detail = await api.get("/leads/l-office");
    expect(detail.tags.map((tag: { name: string }) => tag.name)).toEqual(["VIP"]);

    await gotoLead(page, "l-office");
    await expect(feed(page).getByText(fill(t.event.stageChanged, { actor: "Ada Yıldız", from: STAGE.offer, to: STAGE.first }))).toBeVisible();
    await expect(feed(page).getByText(fill(t.event.stageChanged, { actor: t.event.byAutomation, from: STAGE.first, to: STAGE.talk }))).toBeVisible();
    await expect(feed(page).getByText(fill(t.event.responsibleChanged, { actor: t.event.byAutomation, to: "Bora Şahin" }))).toBeVisible();
  });

  test("F11-E1 birbirini tetikleyen iki taşıma sonsuza kadar dönmez", async ({ api }) => {
    await api.post("/automations", { stageId: "s-first", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: "s-talk" } });
    await api.post("/automations", { stageId: "s-talk", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: "s-first" } });
    const started = Date.now();
    const moved = await api.patch("/leads/l-office", { stageId: "s-first", expectedStageId: "s-offer" });
    expect(moved.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(["s-first", "s-talk"]).toContain(moved.body.stageId);
    const events = ((await api.get("/leads/l-office/feed")) as Array<{ kind: string; event?: { type: string; actorKind: string } }>).filter(
      (item) => item.kind === "event" && item.event?.type === "stage_changed" && item.event.actorKind === "automation",
    );
    // Zincir belirli bir derinlikte kesilir.
    expect(events.length).toBeGreaterThan(1);
    expect(events.length).toBeLessThanOrEqual(6);
  });

  test("F11-E3 sırayla dağıtım sahibi olan lead'e dokunmaz; \"belirli kişi\" her zaman atar", async ({ api }) => {
    await api.post("/automations", roundRobin("s-first", ["u-bora"]));
    const manual = await api.post("/leads", { name: "Elle eklenen" });
    expect(manual.body.responsibleUserId).toBe("u-ada");

    await api.post("/automations", { stageId: "s-talk", onEvent: "lead_created", kind: "change_responsible", settings: { mode: "user", userId: "u-bora" } });
    const forced = await api.post("/leads", { name: "Görüşmede açılan", stageId: "s-talk" });
    expect(forced.body.responsibleUserId).toBe("u-bora");
  });

  test("F11-E6 kısıtlı üyenin işlemi, lead'i başkasına atayan bir tetikleyiciyi çalıştırsa da tamamlanır", async ({ page, api }) => {
    expect((await api.post("/automations", { stageId: "s-first", onEvent: "stage_entered", kind: "change_responsible", settings: { mode: "user", userId: "u-bora" } })).status).toBe(201);
    // Oturum, yalnız kendi kayıtlarını gören üyeye geçer.
    await page.context().addCookies([{ name: "ysc-dev-user", value: id("u-cem"), url: "http://localhost:3000" }]);
    const accepted = await api.post("/leads/l-elif/accept");
    expect(accepted.status).toBe(200);
    expect(accepted.body.responsibleUserId).toBe("u-bora");
    // Lead artık başkasının: kısıtlı üye onu göremez.
    expect((await page.request.get(u(`/api/w/${WS}/leads/l-elif`))).status()).toBe(404);
  });

  test("F11-E4 geçersiz tetikleyiciler reddedilir", async ({ api }) => {
    const other = await api.post("/pipelines", { name: "İkinci", stageNames: { incoming: "Gelen", open: ["Bir"], won: "Kazanıldı", lost: "Kaybedildi" } });
    const foreign = other.body.stages.find((stage: { kind: string }) => stage.kind === "open").id;
    const cases: Array<[string, object, number]> = [
      ["başka pipeline'ın aşamasına taşıma", { stageId: "s-first", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: foreign } }, 422],
      ["gelen talepler aşamasına taşıma", { stageId: "s-first", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: "s-in" } }, 422],
      ["kendi aşamasına taşıma", { stageId: "s-first", onEvent: "stage_entered", kind: "change_stage", settings: { stageId: "s-first" } }, 422],
      ["boş dağıtım listesi", roundRobin("s-first", []), 422],
      ["olmayan kullanıcı", roundRobin("s-first", ["u-yok"]), 404],
      ["başka kiracının kullanıcısı", roundRobin("s-first", ["u-can"]), 404],
      ["başka kiracının görev türü", { stageId: "s-first", onEvent: "stage_entered", kind: "add_task", settings: { typeId: "tt-other", text: "", dueInMinutes: 0, responsible: "lead" } }, 404],
      ["başka kiracının aşaması", roundRobin("s-other-open", ["u-ada"]), 404],
      ["etiketsiz etiket düzenleme", { stageId: "s-first", onEvent: "stage_entered", kind: "edit_tags", settings: { add: [], remove: [] } }, 422],
      ["bilinmeyen eylem", { stageId: "s-first", onEvent: "stage_entered", kind: "send_money", settings: {} }, 422],
      ["bilinmeyen olay", { stageId: "s-first", onEvent: "her_zaman", kind: "change_stage", settings: { stageId: "s-talk" } }, 422],
      ["bir yıldan uzun süre", { stageId: "s-first", onEvent: "stage_entered", kind: "add_task", settings: { typeId: "tt-follow", text: "", dueInMinutes: 600_000, responsible: "lead" } }, 422],
    ];
    for (const [label, body, status] of cases) expect((await api.post("/automations", body)).status, label).toBe(status);
    expect(((await api.get("/automations")) as unknown[]).length).toBe(0);
  });

  test.describe("yönetici olmayan kullanıcı", () => {
    test.use({ asUser: "u-bora" });

    test("F11-E5 yönetici olmayan tetikleyicileri görür ama değiştiremez", async ({ page, api }) => {
      await gotoAutomations(page);
      await expect(page.getByText(a.adminOnly)).toBeVisible();
      await expect(page.getByRole("button", { name: a.add })).toHaveCount(0);
      // Kaynaklar ekranında da yalnız okur: bağlama düğmeleri yoktur.
      await page.goto(`/w/${WS}/sources`);
      await expect(page.getByText(t.sources.adminOnly)).toBeVisible();
      await expect(page.getByRole("button", { name: new RegExp(t.sources.connect) })).toHaveCount(0);
      expect((await api.post("/automations", roundRobin("s-first", ["u-bora"]))).status).toBe(403);
      expect((await api.post("/intakes", { name: "İzinsiz", kind: "generic", stageId: "s-first" })).status).toBe(403);
    });
  });
});
