import { expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, gotoBoard, t, test, u, WS } from "./support";

const dialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: t.search.title });
const input = (page: import("@playwright/test").Page) => page.getByRole("combobox", { name: t.search.label });

test.describe("F07 Genel arama", () => {
  test("F07-H5 Ctrl+K aramayı açar; yazılan lead bulunur, Enter kartını açar", async ({ page }) => {
    await gotoBoard(page);
    await page.keyboard.press("Control+k");
    await expect(dialog(page)).toBeVisible();
    await expect(input(page)).toBeFocused();
    await expect(dialog(page).getByText(t.search.hint)).toBeVisible();
    await input(page).fill("mutf");
    const option = page.getByRole("option", { name: /Mutfak yenileme/ });
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(u(`/w/${WS}/leads/l-kitchen`));
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("heading", { name: "Mutfak yenileme", level: 1 })).toBeVisible();
  });

  test("F07-H6 sonuçlar türe göre gruplanır; ok tuşlarıyla kişiye inilir ve açılır", async ({ page }) => {
    await page.goto(`/w/${WS}/calendar`);
    await page.getByRole("button", { name: t.search.open, exact: true }).click();
    await input(page).fill("deniz");
    const list = page.getByRole("listbox", { name: t.search.results });
    await expect(list.getByRole("group", { name: t.search.groups.leads }).getByRole("option")).toHaveCount(1);
    const contact = list.getByRole("group", { name: t.search.groups.contacts }).getByRole("option", { name: /Deniz Arslan/ });
    await expect(contact).toBeVisible();
    await expect(contact).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("ArrowDown");
    await expect(contact).toHaveAttribute("aria-selected", "true");
    await expect(input(page)).toHaveAttribute("aria-activedescendant", (await contact.getAttribute("id"))!);
    // Sondan başa sarar.
    await page.keyboard.press("ArrowDown");
    await expect(contact).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(u(`/w/${WS}/contacts/c-deniz`));
  });

  test("F07-E8 büyük-küçük harf ve Türkçe harfler: KİTAP kitaplığı, kuzey şirketi, telefon kişiyi bulur", async ({ page }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: t.search.open, exact: true }).click();
    await input(page).fill("KİTAP");
    await expect(page.getByRole("option", { name: /Kitaplık/ })).toBeVisible();
    await input(page).fill("kuzey");
    const company = page.getByRole("listbox").getByRole("group", { name: t.search.groups.companies }).getByRole("option", { name: /Kuzey Mobilya/ });
    await expect(company).toBeVisible();
    await input(page).fill("555 010 20");
    // Telefon yalnız kişide aranır: tek sonuç kalır.
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options).toHaveCount(1);
    await expect(options).toContainText("Deniz Arslan");
    await options.click();
    await expect(page).toHaveURL(u(`/w/${WS}/contacts/c-deniz`));
  });

  test("F07-E11 hızlı yazıp hemen Enter'a basınca eski sorgunun sonucu açılmaz", async ({ page }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: t.search.open, exact: true }).click();
    await input(page).fill("mutf");
    await expect(page.getByRole("option", { name: /Mutfak yenileme/ })).toBeVisible();
    // Yeni sorgu yazılır yazılmaz Enter: liste hâlâ "mutf" sonucunu gösteriyor.
    await input(page).fill("gömme");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByRole("option", { name: /Gömme dolap/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Mutfak yenileme/ })).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(u(`/w/${WS}/leads/l-wardrobe`));
  });

  test("F07-E9 tek harfte arama yapılmaz; sonuç yoksa söylenir; Esc kapatır ve odak düğmeye döner", async ({ page }) => {
    await gotoBoard(page);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/search?")) requests.push(request.url());
    });
    const open = page.getByRole("button", { name: t.search.open, exact: true });
    await open.click();
    await input(page).fill("m");
    await expect(dialog(page).getByText(t.search.hint)).toBeVisible();
    await input(page).fill("zzzyok");
    await expect(dialog(page).getByText(fill(t.search.noMatch, { query: "zzzyok" }))).toBeVisible();
    expect(requests.every((url) => !url.endsWith("q=m"))).toBe(true);
    await expect(input(page)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(open).toBeFocused();
    // Yeniden açınca önceki sorgu kalmaz.
    await open.click();
    await expect(input(page)).toHaveValue("");
  });

  test("F07-E10 erişilebilirlik: sonuçlar açıkken tarama temiz", async ({ page }) => {
    await gotoBoard(page);
    await page.getByRole("button", { name: t.search.open, exact: true }).click();
    await input(page).fill("deniz");
    const contact = page.getByRole("listbox").getByRole("group", { name: t.search.groups.contacts }).getByRole("option", { name: /Deniz Arslan/ });
    await expect(contact).toBeVisible();
    await expectNoA11yViolations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(contact).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test.describe("kısıtlı üye", () => {
    test.use({ asUser: "u-cem" });

    test("F07-N3 arama, üyenin göremediği kayıtları bulmaz", async ({ page, api }) => {
      expect(await api.get("/search?q=mutfak")).toEqual({ leads: [], contacts: [], companies: [] });
      expect(await api.get("/search?q=deniz")).toEqual({ leads: [], contacts: [], companies: [] });
      const own = await api.get("/search?q=telegram");
      expect(own.leads.map((lead: { name: string }) => lead.name)).toEqual(["Telegram talebi"]);
      await gotoBoard(page);
      await page.getByRole("button", { name: t.search.open, exact: true }).click();
      await input(page).fill("mutfak");
      await expect(dialog(page).getByText(fill(t.search.noMatch, { query: "mutfak" }))).toBeVisible();
    });
  });

  test("F07-N4 arama ucu: kısa ve çok uzun sorgu, joker karakterler", async ({ api }) => {
    expect(await api.get("/search?q=")).toEqual({ leads: [], contacts: [], companies: [] });
    expect(await api.get("/search?q=%20a%20")).toEqual({ leads: [], contacts: [], companies: [] });
    // % ve _ joker değil, düz metindir.
    expect((await api.get("/search?q=%25%25")).leads).toEqual([]);
    expect((await api.get("/search?q=__")).leads).toEqual([]);
    expect((await api.get(`/search?q=${"a".repeat(500)}`)).leads).toEqual([]);
    // Başka kiracının kaydı aranmaz.
    expect((await api.get("/search?q=Gizli")).leads).toEqual([]);
  });
});
