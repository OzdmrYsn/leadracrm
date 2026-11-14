import { column, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, t, test } from "./support";
import type { Page } from "@playwright/test";

const a = t.auth;

// Etiket metninde zorunluluk yıldızı da vardır; göster/gizle düğmesinin adı da "Şifre" ile başlar.
const passwordField = (page: Page) => page.getByLabel(new RegExp(`^${a.password}(\\s*\\*)?$`));
// Önceki sayfa gizli olarak DOM'da kalabilir; rol sorgusu yalnız görüneni bulur.
const emailField = (page: Page) => page.getByRole("textbox", { name: a.email });

async function signUp(page: Page, input: { name: string; email: string; workspace: string; password?: string }) {
  await page.goto("/signup");
  await page.getByLabel(a.name).fill(input.name);
  await emailField(page).fill(input.email);
  await passwordField(page).fill(input.password ?? "uzun-bir-sifre");
  await page.getByLabel(a.workspace).fill(input.workspace);
  await page.getByRole("button", { name: a.signupSubmit }).click();
}

test.describe("F01 kayıt, giriş ve çıkış (geliştirme sağlayıcısı)", () => {
  test("F01-H1 kayıt: çalışma alanı Türkçe aşamalarla kurulur ve pano açılır", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { level: 1, name: a.signupTitle })).toBeVisible();
    await expect(page.getByText(a.devNotice)).toBeVisible();
    await expectNoA11yViolations(page);

    await signUp(page, { name: "Gülşen Çınar", email: "gulsen@ornek.test", workspace: "Çınar Mobilya & Dekor" });
    await expect(page).toHaveURL(/\/w\/cinar-mobilya-dekor\/pipelines$/);
    // Gelen talepler sütunu yalnız talep varken görünür.
    for (const stage of ["İlk temas", "Görüşme", "Teklif"]) await expect(column(page, stage)).toBeVisible();
    await expect(page.getByText(t.board.emptyBoardTitle)).toBeVisible();
    await expect(page.getByRole("button", { name: fill(a.accountMenu, { name: "Gülşen Çınar" }) })).toBeVisible();

    // Yeni hesap yalnız kendi çalışma alanını görür.
    expect((await page.request.get("/api/w/demo/session")).status()).toBe(404);
    const session = (await (await page.request.get("/api/w/cinar-mobilya-dekor/session")).json()) as { workspace: { currency: string }; user: { isAdmin: boolean }; lossReasons: unknown[] };
    expect(session.workspace.currency).toBe("TRY");
    expect(session.user.isAdmin).toBe(true);
    expect(session.lossReasons).toHaveLength(4);
  });

  test("F01-H2 çıkış yapılır; aynı e-postayla giriş panoya döner", async ({ page }) => {
    await signUp(page, { name: "Kaan Öz", email: "kaan@ornek.test", workspace: "Öz Atölye" });
    await expect(page).toHaveURL(/\/w\/oz-atolye\/pipelines$/);

    await page.getByRole("button", { name: fill(a.accountMenu, { name: "Kaan Öz" }) }).click();
    await page.getByRole("menuitem", { name: a.logout }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: a.loginTitle })).toBeVisible();
    await expectNoA11yViolations(page);

    await emailField(page).fill("KAAN@ornek.test");
    await passwordField(page).fill("uzun-bir-sifre");
    await page.getByRole("button", { name: a.loginSubmit }).click();
    await expect(page).toHaveURL(/\/w\/oz-atolye\/pipelines$/);
  });

  test("F01-E1 boş ve geçersiz alanlar gönderilmez; her alanın altında nedeni yazar", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: a.signupSubmit }).click();
    for (const message of [a.invalid.name, a.invalid.email, a.invalid.password, a.invalid.workspace]) await expect(page.getByText(message)).toBeVisible();
    await expectNoA11yViolations(page);

    await emailField(page).fill("adres-degil");
    await page.getByRole("button", { name: a.signupSubmit }).click();
    await expect(page.getByText(a.invalid.emailFormat)).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("F01-E2 aynı adlı ikinci işletme ayrı bir adres alır", async ({ page, context }) => {
    await signUp(page, { name: "Bir", email: "bir@ornek.test", workspace: "Usta" });
    await expect(page).toHaveURL(/\/w\/usta\/pipelines$/);
    await context.clearCookies();
    await signUp(page, { name: "İki", email: "iki@ornek.test", workspace: "Usta" });
    await expect(page).toHaveURL(/\/w\/usta-2\/pipelines$/);
  });

  test("F01-E3 dar ekranda kayıt ve giriş sayfaları taşmaz; şifre gösterilip gizlenir", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/signup", "/login", "/forgot"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.goto("/login");
    const password = passwordField(page);
    await password.fill("gizli-sifre");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: a.showPassword }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: a.hidePassword }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("F01-E4 şifre sıfırlama: e-posta gönderimi bağlı değilken bunu açıkça söyler", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: a.forgotLink }).click();
    await expect(page.getByRole("heading", { level: 1, name: a.forgotTitle })).toBeVisible();
    await expectNoA11yViolations(page);
    await emailField(page).fill("ada@ornek.test");
    await page.getByRole("button", { name: a.forgotSubmit }).click();
    await expect(page.getByText(a.forgotUnavailable)).toBeVisible();
    await page.getByRole("link", { name: a.backToLogin }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("reddedilen istekler", () => {
    test.use({ allow4xx: [401, 409, 422] });

    test("F01-N1 kayıtlı e-postayla ikinci hesap açılmaz; kayıtsız e-postayla giriş yapılmaz", async ({ page, context }) => {
      await signUp(page, { name: "Ada Yıldız", email: "ADA@ornek.test", workspace: "Kopya" });
      await expect(page.getByText(t.errors.email_taken)).toBeVisible();
      await expect(page).toHaveURL(/\/signup$/);

      await context.clearCookies();
      await page.goto("/login");
      await emailField(page).fill("yok@ornek.test");
      await passwordField(page).fill("herhangi-bir-sey");
      await page.getByRole("button", { name: a.loginSubmit }).click();
      await expect(page.getByText(t.errors.invalid_login)).toBeVisible();

      // Sunucu da doğrular: kısa şifre ve bozuk e-posta reddedilir.
      expect((await page.request.post("/api/auth/signup", { data: { name: "x", email: "x@ornek.test", password: "kisa", workspaceName: "X" } })).status()).toBe(422);
      expect((await page.request.post("/api/auth/signup", { data: { name: "x", email: "bozuk", password: "uzun-bir-sifre", workspaceName: "X" } })).status()).toBe(422);
    });
  });
});
