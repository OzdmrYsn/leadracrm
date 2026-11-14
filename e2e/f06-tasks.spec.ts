import { card, expect, expectNoA11yViolations, feed, fill, gotoBoard, gotoLead, t, test, WS } from "./support";
import type { Page } from "@playwright/test";

type Task = { id: string; text: string; dueAt: string; completedAt: string | null; resultText: string | null; responsible: { id: string } | null };

const TZ = "Europe/Istanbul";
const DAY_MS = 86_400_000;
/** Çalışma alanının dilimindeki takvim günü (yyyy-aa-gg), bugünden itibaren kaydırılmış. */
const workspaceDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now() + offsetDays * DAY_MS);
/** Takvimdeki gün düğmesinin okunur adı. */
const dayLabel = (day: string, count: number) =>
  fill(t.calendar.dayTasks, {
    day: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", weekday: "long" }).format(new Date(`${day}T09:00:00Z`)),
    count,
  });

const tasksPanel = (page: Page) => page.getByRole("region", { name: t.tasks.open });
const tasksOf = (api: { get: (path: string) => Promise<unknown> }, query: string) => api.get(`/tasks?status=all&${query}`) as Promise<Task[]>;

async function openTaskDialog(page: Page) {
  await page.getByRole("button", { name: t.tasks.add }).first().click();
  const dialog = page.getByRole("dialog", { name: t.tasks.newTitle });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function gotoCalendar(page: Page) {
  await page.goto(`/w/${WS}/calendar`);
  await expect(page.getByRole("group", { name: t.calendar.viewLabel })).toBeVisible();
  await expect(page.locator("[aria-busy]")).toHaveCount(0);
}

test.describe("F06 görev oluştur ve tamamla", () => {
  test("F06-H1 lead kartından görev eklenir: açık görevlerde, akışta ve panoda görünür; saat çalışma alanının diliminde saklanır", async ({ page, api }) => {
    await gotoLead(page, "l-desks");
    await expect(tasksPanel(page).getByText(t.tasks.none)).toBeVisible();
    const dialog = await openTaskDialog(page);
    await dialog.getByLabel(t.tasks.text).fill("Numune gönder");
    await dialog.getByRole("button", { name: t.tasks.tomorrow }).click();
    await dialog.getByRole("button", { name: t.tasks.submit }).click();
    await expect(dialog).toBeHidden();

    await expect(tasksPanel(page).getByRole("listitem").filter({ hasText: "Numune gönder" })).toBeVisible();
    await expect(feed(page).getByText(fill(t.event.taskAdded, { actor: "Ada Yıldız", task: "Numune gönder" }))).toBeVisible();
    const [task] = await tasksOf(api, "lead=l-desks");
    expect(task.dueAt).toBe(`${workspaceDay(1)}T07:00:00.000Z`);
    expect(task.responsible?.id).toBe("u-ada");

    await gotoBoard(page);
    await expect(card(page, "Ofis masaları")).toBeVisible();
    await expect(card(page, "Ofis masaları").getByText(t.board.noTask)).toHaveCount(0);
  });

  test("F06-H2 görev sonuç metniyle tamamlanır: açık listeden çıkar, sonucu akışa yazılır", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    await page.getByRole("button", { name: fill(t.tasks.completeLabel, { task: "Ölçü almak için ziyaret" }) }).click();
    await page.getByLabel(t.tasks.result).fill("Ölçüler alındı");
    await page.getByRole("button", { name: t.tasks.confirmComplete }).click();
    await expect(tasksPanel(page).getByText(t.tasks.none)).toBeVisible();
    await expect(
      feed(page).getByText(fill(t.event.taskCompletedResult, { actor: "Ada Yıldız", task: "Ölçü almak için ziyaret", result: "Ölçüler alındı" })),
    ).toBeVisible();
    const done = (await tasksOf(api, "lead=l-kitchen")).find((task) => task.id === "k-1")!;
    expect(done.completedAt).not.toBeNull();
    expect(done.resultText).toBe("Ölçüler alındı");
  });

  test("F06-H3 takvimden görev: lead aranıp seçilir, görev seçilen haftada görünür", async ({ page, api }) => {
    await gotoCalendar(page);
    const dialog = await openTaskDialog(page);
    await dialog.getByRole("button", { name: t.leadPicker.pick }).click();
    await page.getByRole("searchbox", { name: t.leadPicker.searchLabel }).fill("OFİS");
    await page.getByRole("button", { name: /Ofis masaları/ }).click();
    await expect(dialog.getByText("Ofis masaları")).toBeVisible();
    await dialog.getByLabel(t.tasks.text).fill("Keşif ziyareti");
    await dialog.getByRole("button", { name: t.tasks.nextWeek }).click();
    await dialog.getByRole("button", { name: t.tasks.submit }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: t.tasks.add })).toBeFocused();

    await page.getByRole("button", { name: t.calendar.next }).click();
    await expect(page.getByRole("link", { name: /Keşif ziyareti/ })).toBeVisible();
    const [task] = await tasksOf(api, "lead=l-desks");
    expect(task.dueAt).toBe(`${workspaceDay(7)}T07:00:00.000Z`);
  });

  test("F06-E12 aynı güne birden çok görev düşünce takvim erişilebilir kalır (dokunma hedefi boyutu)", async ({ page, api }) => {
    // Örnek veride görevler "şimdi"ye göre kurulur; aynı güne iki görevin düşmesi günün saatine bağlıdır.
    // Burada bilerek kurulur: bugün, gün bitmeden.
    for (const text of ["Birinci görev", "İkinci görev", "Üçüncü görev"]) {
      expect((await api.post("/tasks", { leadId: "l-kitchen", typeId: "tt-follow", text, dueAt: `${workspaceDay(0)}T20:59:00.000Z` })).status).toBe(201);
    }
    await gotoCalendar(page);
    await expect(page.getByRole("link", { name: /Birinci görev/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /İkinci görev/ })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("F06-H4 takvimde gün görünümünden tamamlama: görev tamamlandı olarak ve sonucuyla kalır", async ({ page, api }) => {
    // Örnek veride bu görev "üç saat sonra"dır; gece 21'den sonra yarına düşer. Bugüne sabitlenir.
    expect((await api.patch("/tasks/k-2", { dueAt: `${workspaceDay(0)}T20:59:00.000Z` })).status).toBe(200);
    await gotoCalendar(page);
    await page.getByRole("group", { name: t.calendar.viewLabel }).getByRole("button", { name: t.calendar.views.day }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Fiyat teklifini sor" });
    await row.getByRole("button", { name: fill(t.tasks.completeLabel, { task: "Fiyat teklifini sor" }) }).click();
    await row.getByLabel(t.tasks.result).fill("Teklif e-postayla istendi");
    await row.getByLabel(t.tasks.result).press("Enter");
    await expect(row).toContainText(t.tasks.done);
    await expect(row).toContainText("Teklif e-postayla istendi");
    await expect(row.getByRole("button", { name: /tamamla/ })).toHaveCount(0);
  });

  test("F06-E1 son tarihi geçmişte olan görev eklenebilir; gecikmiş olarak işaretlenir ve takvimde üstte durur", async ({ page }) => {
    await gotoLead(page, "l-desks");
    const dialog = await openTaskDialog(page);
    await dialog.getByLabel(t.tasks.text).fill("Dün aranacaktı");
    await dialog.getByLabel(t.tasks.date).fill(workspaceDay(-1));
    await dialog.getByRole("button", { name: t.tasks.submit }).click();
    await expect(dialog).toBeHidden();
    await expect(tasksPanel(page).getByRole("listitem").filter({ hasText: "Dün aranacaktı" })).toContainText(t.tasks.overdue);

    await gotoCalendar(page);
    const overdue = page.getByRole("region", { name: fill(t.calendar.overdue, { count: 2 }) });
    await expect(overdue.getByText("Dün aranacaktı")).toBeVisible();
  });

  test("F06-E2 tarih boşsa görev eklenmez ve neden söylenir", async ({ page, api }) => {
    await gotoLead(page, "l-desks");
    const dialog = await openTaskDialog(page);
    await dialog.getByLabel(t.tasks.text).fill("Tarihsiz");
    await dialog.getByLabel(t.tasks.date).fill("");
    await dialog.getByRole("button", { name: t.tasks.submit }).click();
    await expect(dialog.getByText(t.tasks.dueRequired)).toBeVisible();
    expect(await tasksOf(api, "lead=l-desks")).toHaveLength(0);
  });

  test("F06-E4 takvimden lead seçmeden gönderilirse uyarı çıkar", async ({ page }) => {
    await gotoCalendar(page);
    const dialog = await openTaskDialog(page);
    await dialog.getByRole("button", { name: t.tasks.submit }).click();
    await expect(dialog.getByText(t.tasks.targetRequired)).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("F06-E7 takvimde gezinme: hafta, sonraki, bugün, ay, güne tıklayınca gün görünümü", async ({ page }) => {
    await gotoCalendar(page);
    const views = page.getByRole("group", { name: t.calendar.viewLabel });
    const heading = page.getByRole("heading", { level: 2 }).first();
    await expect(views.getByRole("button", { name: t.calendar.views.week })).toHaveAttribute("aria-pressed", "true");
    const thisWeek = await heading.textContent();
    await expect(page.getByRole("button", { name: t.calendar.today })).toBeDisabled();

    await page.getByRole("button", { name: t.calendar.next }).click();
    await expect(heading).not.toHaveText(thisWeek!);
    await page.getByRole("button", { name: t.calendar.today }).click();
    await expect(heading).toHaveText(thisWeek!);

    await views.getByRole("button", { name: t.calendar.views.month }).click();
    const monthName = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, month: "long", year: "numeric" }).format(new Date());
    await expect(heading).toHaveText(monthName);
    await expect(page.getByRole("button", { name: /görev$/ })).toHaveCount(42);

    const today = workspaceDay(0);
    await page.locator('button[aria-current="date"]').click();
    await expect(views.getByRole("button", { name: t.calendar.views.day })).toHaveAttribute("aria-pressed", "true");
    const dayHeading = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, dateStyle: "full" }).format(new Date(`${today}T09:00:00Z`));
    await expect(heading).toHaveText(dayHeading);
    await page.getByRole("button", { name: t.calendar.previous }).click();
    await expect(heading).not.toHaveText(dayHeading);
  });

  test("F06-E8 benim / herkes: başkasına atanmış görev yalnız herkes görünümünde çıkar", async ({ page, api }) => {
    const due = `${workspaceDay(0)}T20:30:00.000Z`;
    expect((await api.post("/tasks", { leadId: "l-desks", typeId: "tt-follow", text: "Bora'nın görevi", dueAt: due, responsibleUserId: "u-bora" })).status).toBe(201);
    await gotoCalendar(page);
    await expect(page.getByText("Fiyat teklifini sor").first()).toBeVisible();
    await expect(page.getByText("Bora'nın görevi")).toHaveCount(0);
    await page.getByRole("group", { name: t.calendar.scopeLabel }).getByRole("button", { name: t.calendar.everyone }).click();
    await expect(page.getByText("Bora'nın görevi").first()).toBeVisible();
  });

  test("F06-E9 çok uzun ve emojili görev metni kartın dar sütununu taşırmaz", async ({ page, api }) => {
    const text = `Müşteriyi ara ☎️ ${"çokuzunbirkelimeboşluksuz".repeat(20)} ${"uzun ".repeat(200)}`.slice(0, 2000);
    expect((await api.post("/tasks", { leadId: "l-desks", typeId: "tt-follow", text, dueAt: `${workspaceDay(1)}T07:00:00.000Z` })).status).toBe(201);
    await gotoLead(page, "l-desks");
    const panel = page.getByRole("region", { name: t.lead.details });
    const row = tasksPanel(page).getByRole("listitem").first();
    await expect(row).toBeVisible();
    const rowBox = (await row.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("F06-E10 gönder düğmesine çift tıklamak tek görev oluşturur", async ({ page, api }) => {
    await gotoLead(page, "l-desks");
    const dialog = await openTaskDialog(page);
    await dialog.getByLabel(t.tasks.text).fill("Çift tıklama");
    await dialog.getByRole("button", { name: t.tasks.submit }).dblclick();
    await expect(dialog).toBeHidden();
    expect(await tasksOf(api, "lead=l-desks")).toHaveLength(1);
  });

  test("F06-E11 silinen lead'in görevi takvimden kalkar", async ({ page, api }) => {
    await gotoCalendar(page);
    await expect(page.getByRole("region", { name: fill(t.calendar.overdue, { count: 1 }) })).toBeVisible();
    expect((await api.delete("/leads/l-office")).status).toBeLessThan(300);
    await page.reload();
    await expect(page.getByRole("group", { name: t.calendar.viewLabel })).toBeVisible();
    await expect(page.locator("[aria-busy]")).toHaveCount(0);
    await expect(page.getByText("Teklif onayını hatırlat")).toHaveCount(0);
    expect((await tasksOf(api, "")).some((task) => task.id === "k-3")).toBe(false);
  });

  test.describe("farklı saat dilimindeki tarayıcı", () => {
    test.use({ timezoneId: "America/Los_Angeles" });

    test("F06-E5 gün, tarayıcının değil çalışma alanının dilimine göre belirlenir", async ({ page, api }) => {
      // 22:30 UTC: İstanbul'da ertesi gün 01:30, Los Angeles'ta aynı gün öğleden sonra.
      const utcDay = workspaceDay(3);
      const istanbulDay = workspaceDay(4);
      expect((await api.post("/tasks", { leadId: "l-desks", typeId: "tt-follow", text: "Gece yarısından sonra", dueAt: `${utcDay}T22:30:00.000Z` })).status).toBe(201);

      await gotoCalendar(page);
      await page.getByRole("group", { name: t.calendar.scopeLabel }).getByRole("button", { name: t.calendar.everyone }).click();
      await page.getByRole("group", { name: t.calendar.viewLabel }).getByRole("button", { name: t.calendar.views.month }).click();
      const cell = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /görev$/ }) }).filter({ hasText: "Gece yarısından sonra" });
      await expect(cell).toHaveCount(1);
      await expect(cell.getByRole("button", { name: /görev$/ })).toHaveAccessibleName(new RegExp(`^${dayLabel(istanbulDay, 0).split(":")[0]}:`));
      await expect(cell).toContainText("01:30");

      // Pencereden eklenen görev de çalışma alanının saatiyle saklanır.
      await gotoLead(page, "l-wardrobe");
      const dialog = await openTaskDialog(page);
      await dialog.getByLabel(t.tasks.text).fill("Başka dilimden");
      await dialog.getByLabel(t.tasks.date).fill(workspaceDay(2));
      await dialog.getByLabel(t.tasks.time).fill("09:15");
      await dialog.getByRole("button", { name: t.tasks.submit }).click();
      await expect(dialog).toBeHidden();
      const created = (await tasksOf(api, "lead=l-wardrobe")).find((task) => task.text === "Başka dilimden")!;
      expect(created.dueAt).toBe(`${workspaceDay(2)}T06:15:00.000Z`);
    });
  });

  test.describe("iki sekme ve geçersiz istekler", () => {
    test.use({ allow4xx: [404, 409, 422] });

    test("F06-E3 başka sekmede tamamlanan görev yeniden tamamlanmak istenirse uyarı çıkar", async ({ page, api }) => {
      await gotoLead(page, "l-kitchen");
      expect((await api.post("/tasks/k-1/complete", { resultText: "Diğer sekme" })).status).toBe(200);
      await page.getByRole("button", { name: fill(t.tasks.completeLabel, { task: "Ölçü almak için ziyaret" }) }).click();
      await page.getByRole("button", { name: t.tasks.confirmComplete }).click();
      await expect(page.getByText(t.errors.task_completed)).toBeVisible();
      const done = (await tasksOf(api, "lead=l-kitchen")).find((task) => task.id === "k-1")!;
      expect(done.resultText).toBe("Diğer sekme");
    });

    test("F06-N1 API: iki kayda bağlı görev, geçersiz tarih, olmayan tür ve kayıt reddedilir", async ({ api }) => {
      const due = `${workspaceDay(1)}T07:00:00.000Z`;
      const two = await api.post("/tasks", { leadId: "l-desks", contactId: "c-deniz", typeId: "tt-follow", dueAt: due });
      expect([two.status, two.body.error.code]).toEqual([422, "task_target"]);
      const none = await api.post("/tasks", { typeId: "tt-follow", dueAt: due });
      expect(none.status).toBe(422);
      expect((await api.post("/tasks", { leadId: "l-desks", typeId: "tt-follow", dueAt: "yarın" })).status).toBe(422);
      expect((await api.post("/tasks", { leadId: "l-desks", typeId: "tt-yok", dueAt: due })).status).toBe(404);
      expect((await api.post("/tasks", { leadId: "l-yok", typeId: "tt-follow", dueAt: due })).status).toBe(404);
      expect((await api.post("/tasks", { leadId: "l-desks", typeId: "tt-follow", dueAt: due, responsibleUserId: "u-yok" })).status).toBe(404);
      expect((await api.post("/tasks/k-5/complete", {})).status).toBe(409);
      expect((await api.post("/tasks/k-yok/complete", {})).status).toBe(404);
    });
  });
});
