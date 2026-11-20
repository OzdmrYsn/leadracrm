import { card, column, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, gotoBoard, gotoLead, id, STAGE, t, test, u, WS } from "./support";
import type { Page } from "@playwright/test";

/** Gerçek ekranlar ve her birinde içeriğin yüklendiğini gösteren öğe. */
const screens: Array<{ id: string; path: string; ready: (page: Page) => ReturnType<Page["getByRole"]> }> = [
  { id: "S05 bugün", path: "home", ready: (page) => page.getByRole("heading", { name: t.home.pipelineTitle }) },
  { id: "S06 pano", path: "pipelines", ready: (page) => column(page, STAGE.first) },
  { id: "S07 lead listesi", path: "leads", ready: (page) => page.getByRole("table") },
  { id: "S10 lead kartı", path: "leads/l-kitchen", ready: (page) => page.getByRole("region", { name: t.lead.details }) },
  { id: "S10 gelen talep kartı", path: "leads/l-elif", ready: (page) => page.getByRole("region", { name: t.incoming.title }) },
  { id: "S18 gelen kutusu", path: "inbox?c=cv-deniz", ready: (page) => page.getByRole("list", { name: t.chat.messages }) },
  { id: "S21 takvim", path: "calendar", ready: (page) => page.getByRole("group", { name: t.calendar.viewLabel }) },
  { id: "S23 kişiler", path: "contacts", ready: (page) => page.getByRole("table") },
  { id: "S24 şirketler", path: "companies", ready: (page) => page.getByRole("table") },
  { id: "S25 kişi kartı", path: "contacts/c-deniz", ready: (page) => page.getByRole("region", { name: t.contacts.details }) },
  { id: "S25 şirket kartı", path: "companies/co-kuzey", ready: (page) => page.getByRole("region", { name: t.companies.details }) },
  { id: "S15 otomasyonlar", path: "automations", ready: (page) => page.getByRole("heading", { name: t.automations.triggersTitle }) },
  { id: "S41 kaynaklar", path: "sources", ready: (page) => page.getByRole("heading", { name: t.sources.readyTitle }) },
  { id: "S36 raporlar", path: "insights", ready: (page) => page.getByRole("region", { name: t.insights.summary }) },
  { id: "S39 çalışma alanı ayarları", path: "settings/workspace", ready: (page) => page.getByLabel(t.workspaceSettings.name) },
  { id: "S40 kullanıcılar", path: "settings/users", ready: (page) => page.getByRole("heading", { name: t.team.title }) },
  { id: "faturalandırma", path: "settings/billing", ready: (page) => page.getByRole("button", { name: t.billing.goToPayment }) },
];

async function open(page: Page, screen: (typeof screens)[number]) {
  await page.goto(u(`/w/${WS}/${screen.path}`));
  await expect(screen.ready(page).first()).toBeVisible();
  await expect(page.locator("#main [aria-busy]")).toHaveCount(0);
}

test.describe("X kabuk ve ortak davranışlar", () => {
  test("X-H1 ana menü her bölüme götürür ve bulunulan bölümü işaretler", async ({ page }) => {
    await gotoBoard(page);
    const nav = page.getByRole("navigation", { name: t.nav.label });
    for (const [label, path] of [
      [t.nav.leads, "leads"],
      [t.nav.inbox, "inbox"],
      [t.nav.calendar, "calendar"],
      [t.nav.contacts, "contacts"],
      [t.nav.companies, "companies"],
      [t.nav.sources, "sources"],
      [t.nav.home, "home"],
      [t.nav.pipelines, "pipelines"],
    ] as const) {
      await nav.getByRole("link", { name: new RegExp(`^${label}`) }).click();
      await expect(page).toHaveURL(new RegExp(`/w/${WS}/${path}`));
      await expect(nav.getByRole("link", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    }
  });

  for (const screen of screens) {
    test(`X-E1 erişilebilirlik taraması: ${screen.id}`, async ({ page }) => {
      await open(page, screen);
      await expectNoA11yViolations(page);
    });
  }

  test("X-E1 erişilebilirlik taraması: açık pencereler ve paneller", async ({ page }) => {
    await gotoBoard(page);
    await page.getByRole("banner").getByRole("button", { name: t.board.addLead }).click();
    await expect(page.getByRole("dialog", { name: t.newLead.title })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");

    await page.getByRole("search", { name: t.filter.label }).getByRole("button", { name: t.filter.more, exact: true }).click();
    await expect(page.getByRole("dialog", { name: t.filter.panel })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: t.pipeline.menu }).click();
    await page.getByRole("menuitem", { name: t.pipeline.edit }).click();
    await expect(page.getByRole("dialog", { name: t.pipeline.edit })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");

    await gotoLead(page, "l-kitchen");
    await page.getByRole("button", { name: t.tasks.add }).click();
    await expect(page.getByRole("dialog", { name: t.tasks.newTitle })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: t.fields.manage }).click();
    await expect(page.getByRole("dialog", { name: t.fields.manageTitle.lead })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test.describe("telefon genişliği", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("X-E2 390 pikselde hiçbir ekran yatay taşmaz; dokunma hedefleri en az 24 piksel", async ({ page }) => {
      for (const screen of screens) {
        await open(page, screen);
        await expectNoHorizontalOverflow(page);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("#main button, #main [role=combobox], #main [role=switch], #main input, aside a")]
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.height > 0 && (box.width < 24 || box.height < 24) && getComputedStyle(element).visibility !== "hidden";
            })
            .map((element) => `${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 30)} ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`),
        );
        expect(small, `${screen.id}: küçük dokunma hedefi`).toEqual([]);
      }
    });

    test("X-E2b telefonda gelen kutusu: liste ve konuşma ayrı ekranlar, geri dönülür", async ({ page }) => {
      await page.goto(`/w/${WS}/inbox`);
      await page.getByRole("button", { name: /Deniz Arslan/ }).click();
      await expect(page.getByRole("list", { name: t.chat.messages })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: t.inbox.searchLabel })).toBeHidden();
      await page.getByRole("button", { name: t.inbox.backToList }).or(page.getByRole("link", { name: t.inbox.backToList })).click();
      await expect(page.getByRole("searchbox", { name: t.inbox.searchLabel })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  });

  test("X-E4 geri ve ileri düğmesi: panodan karta, karttan panoya", async ({ page }) => {
    await gotoBoard(page);
    await card(page, "Mutfak yenileme").getByRole("link", { name: "Mutfak yenileme" }).click();
    await expect(page.getByRole("heading", { name: "Mutfak yenileme", level: 1 })).toBeVisible();
    await page.goBack();
    await expect(column(page, STAGE.talk)).toBeVisible();
    await expect(page).toHaveURL(/\/pipelines$/);
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Mutfak yenileme", level: 1 }).filter({ visible: true })).toBeVisible();
  });

  test("X-E5 içeriğe geç bağlantısı klavyeyle ilk durakta ve odağı içeriğe taşır", async ({ page }) => {
    await gotoBoard(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: t.common.skipToContent });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("X-E6 yavaş ağda iskelet gösterilir, veri gelince yerini içerik alır", async ({ page }) => {
    await page.route("**/pipelines/*/board*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue().catch(() => undefined);
    });
    await page.goto(`/w/${WS}/pipelines`);
    await expect(page.locator("#main [aria-busy]")).toBeVisible();
    await expect(page.getByRole("button", { name: t.board.addLead }).first()).toBeVisible();
    await expect(column(page, STAGE.first)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#main [aria-busy]")).toHaveCount(0);
  });

  test("X-E7 veri alınamazsa hata durumu ve yeniden dene; bağlantı gelince düzelir", async ({ page }) => {
    await page.route("**/api/w/demo/leads?*", (route) => route.abort());
    await page.route("**/api/w/demo/leads", (route) => route.abort());
    await page.goto(`/w/${WS}/leads`);
    await expect(page.getByText(t.common.loadFailed)).toBeVisible({ timeout: 15_000 });
    await page.unroute("**/api/w/demo/leads?*");
    await page.unroute("**/api/w/demo/leads");
    await page.getByRole("button", { name: t.common.retry }).click();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("X-E8 kart düzenlenirken sayfa yenilenirse kaydedilmiş veri korunur, yarım düzenleme atılır", async ({ page, api }) => {
    await gotoLead(page, "l-kitchen");
    const panel = page.getByRole("region", { name: t.lead.details });
    await panel.getByRole("button", { name: new RegExp(`^${t.lead.name} `) }).click();
    await panel.getByLabel(t.lead.name).fill("Yarım kalan ad");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mutfak yenileme", level: 1 })).toBeVisible();
    expect((await api.get("/leads/l-kitchen")).lead.name).toBe("Mutfak yenileme");
  });

  test("X-E11 iki sekme: birinde yapılan taşıma diğerinde yenilemeden görünür", async ({ page, context }) => {
    await gotoBoard(page);
    const second = await context.newPage();
    await second.goto(`/w/${WS}/pipelines`);
    await expect(column(second, STAGE.talk)).toBeVisible();
    await second.getByRole("button", { name: fill(t.board.cardMenu, { name: "Ofis masaları" }) }).click();
    await second.getByRole("menuitem", { name: fill(t.board.moveTo, { stage: STAGE.offer }) }).click();
    await expect(card(column(second, STAGE.offer), "Ofis masaları")).toBeVisible();
    await expect(card(column(page, STAGE.offer), "Ofis masaları")).toBeVisible({ timeout: 10_000 });
    await second.close();
  });

  test.describe("bulunamayan kayıt ve yabancı çalışma alanı", () => {
    test.use({ allow4xx: [404] });

    test("X-E3 olmayan ve silinmiş lead: bulunamadı durumu, panoya dönüş; sorgular sürüp gitmez", async ({ page, api }) => {
      await page.goto(`/w/${WS}/leads/l-yok`);
      await expect(page.getByText(t.common.notFound)).toBeVisible();
      await expect(page.getByRole("link", { name: t.lead.backToBoard }).last()).toBeVisible();

      await gotoLead(page, "l-desks");
      expect((await api.delete("/leads/l-desks")).status).toBeLessThan(300);
      await expect(page.getByText(t.common.notFound)).toBeVisible({ timeout: 12_000 });
      // Kayıt gitti; ekran aynı adresi tekrar tekrar sormaz.
      let asked = 0;
      page.on("request", (outgoing) => {
        if (outgoing.url().includes(`/leads/${id("l-desks")}`)) asked += 1;
      });
      await page.waitForTimeout(6000);
      expect(asked).toBe(0);
    });

    test("X-N1 başka çalışma alanının adresi veri göstermez (ekran ve API)", async ({ page, request }) => {
      for (const path of ["leads", "contacts", "companies", "tasks", "session", "conversations", "tags", "leads/l-kitchen", "pipelines/main/board"]) {
        expect((await request.get(`/api/w/baska/${path}`)).status(), path).toBe(404);
      }
      expect((await request.patch("/api/w/baska/leads/l-kitchen", { data: { name: "Ele geçirildi" } })).status()).toBe(404);
      await page.goto("/w/baska/pipelines");
      await expect(page.getByText(t.common.notFound)).toBeVisible();
      await expect(page.getByText("Mutfak yenileme")).toHaveCount(0);
    });
  });
});
