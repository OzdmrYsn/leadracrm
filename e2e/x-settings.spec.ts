import { actAs, card, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, gotoBoard, t, test, WS } from "./support";

const workspacePage = `/w/${WS}/settings/workspace`;
const profilePage = `/w/${WS}/settings/profile`;

test.describe("Ayarlar: çalışma alanı ve profil", () => {
  test("S39-H1 yönetici ad, para birimi ve saat dilimini değiştirir; değişiklik her ekrana yansır", async ({ page, api }) => {
    await page.goto(workspacePage);
    const name = page.getByLabel(t.workspaceSettings.name);
    await expect(name).toHaveValue("Örnek Atölye");
    const save = page.getByRole("button", { name: t.common.save });
    await expect(save).toBeDisabled();

    await name.fill("Yeni Atölye");
    await page.getByRole("combobox", { name: t.workspaceSettings.currency }).click();
    await page.getByRole("option", { name: /^USD/ }).click();
    await page.getByRole("combobox", { name: t.workspaceSettings.timezone }).click();
    await page.getByRole("option", { name: /Asia\/Baku/ }).click();
    await save.click();
    await expect(page.getByText(t.workspaceSettings.saved)).toBeVisible();
    await expect(save).toBeDisabled();

    expect((await api.get("/session")).workspace).toMatchObject({ name: "Yeni Atölye", currency: "USD", timezone: "Asia/Baku", slug: "demo" });
    // Menüdeki ad ve panodaki tutarlar güncellenir.
    await expect(page.getByRole("complementary").getByText("Yeni Atölye")).toBeVisible();
    await gotoBoard(page);
    await expect(card(page, "Mutfak yenileme")).toContainText("$");

    // Yenileyince kalıcı.
    await page.goto(workspacePage);
    await expect(page.getByLabel(t.workspaceSettings.name)).toHaveValue("Yeni Atölye");
    await expect(page.getByRole("combobox", { name: t.workspaceSettings.timezone })).toContainText("Asia/Baku");
  });

  test("S39-E1 boş ad kaydedilmez: alan hatası görünür, istek gitmez; çok uzun ad yazılamaz", async ({ page, api }) => {
    await page.goto(workspacePage);
    const name = page.getByLabel(t.workspaceSettings.name);
    await name.fill("   ");
    await page.getByRole("button", { name: t.common.save }).click();
    await expect(page.getByText(t.workspaceSettings.nameRequired)).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    expect((await api.get("/session")).workspace.name).toBe("Örnek Atölye");
    await name.fill("a".repeat(200));
    expect((await name.inputValue()).length).toBe(120);
  });

  test("S39-E2 erişilebilirlik ve dar ekran: çalışma alanı ve profil", async ({ page }) => {
    await page.goto(workspacePage);
    await expect(page.getByLabel(t.workspaceSettings.name)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.goto(profilePage);
    await expect(page.getByLabel(t.profile.name)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.goto(workspacePage);
    await expect(page.getByLabel(t.workspaceSettings.name)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("S44-H1 kullanıcı adını değiştirir; menüde ve ekip listesinde yeni ad görünür", async ({ page, api }) => {
    await page.goto(profilePage);
    const name = page.getByLabel(t.profile.name);
    await expect(name).toHaveValue("Ada Yıldız");
    await expect(page.getByText("ada@ornek.test")).toBeVisible();
    await expect(page.getByText(t.team.adminRights)).toBeVisible();
    await name.fill("Ada Yıldız Demir");
    await page.getByRole("button", { name: t.common.save }).click();
    await expect(page.getByText(t.profile.saved)).toBeVisible();
    await expect(page.getByRole("complementary").getByRole("button", { name: fill(t.auth.accountMenu, { name: "Ada Yıldız Demir" }) })).toBeVisible();
    const session = await api.get("/session");
    expect(session.user.name).toBe("Ada Yıldız Demir");
    expect(session.users.map((user: { name: string }) => user.name)).toContain("Ada Yıldız Demir");
  });

  test("S44-E1 boş ad kaydedilmez", async ({ page, api }) => {
    await page.goto(profilePage);
    await page.getByLabel(t.profile.name).fill("");
    await page.getByRole("button", { name: t.common.save }).click();
    await expect(page.getByText(t.profile.nameRequired)).toBeVisible();
    expect((await api.get("/session")).user.name).toBe("Ada Yıldız");
  });

  test.describe("yönetici olmayan üye", () => {
    test.use({ asUser: "u-cem", allow4xx: [403, 422] });

    test("S39-N1 çalışma alanı ayarlarını görür ama değiştiremez", async ({ page, api }) => {
      await page.goto(workspacePage);
      await expect(page.getByText(t.workspaceSettings.adminOnly)).toBeVisible();
      await expect(page.getByLabel(t.workspaceSettings.name)).toBeDisabled();
      await expect(page.getByRole("combobox", { name: t.workspaceSettings.currency })).toBeDisabled();
      await expect(page.getByRole("button", { name: t.common.save })).toHaveCount(0);
      expect((await api.patch("/workspace", { currency: "USD" })).status).toBe(403);
    });

    test("S44-H2 kendi profilini değiştirir ve yetkilerinin özetini görür; başkasının adını değiştiremez", async ({ page, api }) => {
      await page.goto(profilePage);
      await expect(page.getByText(t.profile.rightsBody)).toBeVisible();
      const leads = page.getByRole("definition").filter({ hasText: t.access.actions.delete }).first();
      await expect(leads).toContainText(`${t.access.actions.view}: ${t.access.levels.own}`);
      await expect(leads).toContainText(`${t.access.actions.delete}: ${t.access.levels.none}`);
      await page.getByLabel(t.profile.name).fill("Cem Kara Yılmaz");
      await page.getByRole("button", { name: t.common.save }).click();
      await expect(page.getByText(t.profile.saved)).toBeVisible();
      const session = await api.get("/session");
      expect(session.user.name).toBe("Cem Kara Yılmaz");
      // Profil ucu yalnız oturumdaki kullanıcıyı değiştirir: başka birinin adı aynı kalır.
      expect(session.users.find((user: { id: string }) => user.id === "u-ada").name).toBe("Ada Yıldız");
    });
  });

  test.describe("API doğrulaması", () => {
    test.use({ allow4xx: [422] });

    test("S39-N2 geçersiz para birimi, saat dilimi ve ad reddedilir", async ({ page, api }) => {
      expect((await api.patch("/workspace", { currency: "dolar" })).status).toBe(422);
      expect((await api.patch("/workspace", { timezone: "Mars/Olympus" })).status).toBe(422);
      expect((await api.patch("/workspace", { name: "" })).status).toBe(422);
      expect((await api.patch("/workspace", { name: "a".repeat(121) })).status).toBe(422);
      expect((await api.patch("/profile", { name: " " })).status).toBe(422);
      expect((await api.get("/session")).workspace).toMatchObject({ name: "Örnek Atölye", currency: "TRY" });
      await actAs(page, null);
    });
  });
});
