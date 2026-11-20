import { column, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, t, test, WS } from "./support";
import type { Browser, Page } from "@playwright/test";

// Kayıt, giriş, e-posta doğrulama, şifre sıfırlama ve davet. E-postalar gerçekten gönderilmez: yerel giden kutusuna
// (api/dev/mail) düşer ve testler bağlantıları oradan okur.
const a = t.auth;
const inv = t.invites;
const PASSWORD = "uzun-bir-sifre";
/** Örnek kullanıcıların deneme şifresi (supabase/seed.sql). */
const SEED_PASSWORD = "deneme-sifresi";

// Etiket metninde zorunluluk yıldızı da vardır; göster/gizle düğmesinin adı da "Şifre" ile başlar.
const passwordField = (page: Page, label: string = a.password) => page.getByLabel(new RegExp(`^${label}(\\s*\\*)?$`));
// Önceki sayfa gizli olarak DOM'da kalabilir; rol sorgusu yalnız görüneni bulur.
const emailField = (page: Page) => page.getByRole("textbox", { name: a.email });

type Mail = { to: string; subject: string; text: string };
const outbox = async (page: Page) => (await (await page.request.get("/api/dev/mail")).json()) as Mail[];
/** Adrese giden son iletideki bağlantının yol kısmı. */
async function linkFor(page: Page, to: string): Promise<string> {
  const mail = (await outbox(page)).filter((item) => item.to === to).at(-1);
  expect(mail, `${to} adresine ileti`).toBeTruthy();
  const url = mail!.text.match(/https?:\/\/\S+/)![0];
  return url.replace(/^https?:\/\/[^/]+/, "");
}

async function signUp(page: Page, input: { name: string; email: string; workspace: string; password?: string }) {
  await page.goto("/signup");
  await page.getByLabel(a.name).fill(input.name);
  await emailField(page).fill(input.email);
  await passwordField(page).fill(input.password ?? PASSWORD);
  await page.getByLabel(a.workspace).fill(input.workspace);
  await page.getByRole("button", { name: a.signupSubmit }).click();
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
  await page.getByRole("button", { name: a.loginSubmit }).click();
}

/**
 * Geliştirme kolaylığı kapalı bir tarayıcı: yalnız gerçek oturum geçerlidir (üretimdeki davranış). Oturumun
 * gerçekten açılıp kapandığı bununla sınanır.
 */
async function strictPage(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await context.addCookies([{ name: "ysc-dev-strict", value: "1", url: baseURL }]);
  return { context, page: await context.newPage() };
}

test.describe("F01 kayıt, giriş ve çıkış", () => {
  test("F01-H1 kayıt: çalışma alanı Türkçe aşamalarla kurulur; e-posta bağlantıyla doğrulanır", async ({ page }) => {
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

    // Yeni hesap yalnız kendi çalışma alanını görür; deneme aboneliğiyle başlar.
    expect((await page.request.get("/api/w/demo/session")).status()).toBe(404);
    const session = (await (await page.request.get("/api/w/cinar-mobilya-dekor/session")).json()) as {
      workspace: { currency: string };
      user: { isAdmin: boolean };
      lossReasons: unknown[];
      emailVerified: boolean;
      subscription: { state: string; seats: number };
    };
    expect(session.workspace.currency).toBe("TRY");
    expect(session.user.isAdmin).toBe(true);
    expect(session.lossReasons).toHaveLength(4);
    expect(session.subscription).toMatchObject({ state: "trialing", seats: 10 });

    // E-posta doğrulanmamış: uyarı her ekranda durur; iletideki bağlantı doğrular.
    expect(session.emailVerified).toBe(false);
    const banner = page.getByRole("status").filter({ hasText: a.unverified });
    await expect(banner).toBeVisible();
    await expectNoA11yViolations(page);
    const [mail] = await outbox(page);
    expect(mail).toMatchObject({ to: "gulsen@ornek.test" });
    expect(mail.text).toContain("Gülşen Çınar");
    // Şifre hiçbir iletide ya da yanıtta yer almaz.
    expect(JSON.stringify(await outbox(page))).not.toContain(PASSWORD);

    await page.goto(await linkFor(page, "gulsen@ornek.test"));
    await expect(page.getByText(a.verified)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.goto("/w/cinar-mobilya-dekor/pipelines");
    await expect(column(page, "İlk temas")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: a.unverified })).toHaveCount(0);
  });

  test("F01-H2 çıkış yapılır; aynı e-posta ve şifreyle giriş panoya döner", async ({ page }) => {
    await signUp(page, { name: "Kaan Öz", email: "kaan@ornek.test", workspace: "Öz Atölye" });
    await expect(page).toHaveURL(/\/w\/oz-atolye\/pipelines$/);

    await page.getByRole("button", { name: fill(a.accountMenu, { name: "Kaan Öz" }) }).click();
    await page.getByRole("menuitem", { name: a.logout }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: a.loginTitle })).toBeVisible();
    await expectNoA11yViolations(page);

    await emailField(page).fill("KAAN@ornek.test");
    await passwordField(page).fill(PASSWORD);
    await page.getByRole("button", { name: a.loginSubmit }).click();
    await expect(page).toHaveURL(/\/w\/oz-atolye\/pipelines$/);
  });

  test("F01-H3 şifre sıfırlama: bağlantı e-postayla gelir, yeni şifre belirlenir ve onunla giriş yapılır", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: a.forgotLink }).click();
    await expect(page.getByRole("heading", { level: 1, name: a.forgotTitle })).toBeVisible();
    await expectNoA11yViolations(page);
    await emailField(page).fill("bora@ornek.test");
    await page.getByRole("button", { name: a.forgotSubmit }).click();
    await expect(page.getByText(a.forgotSent)).toBeVisible();

    const link = await linkFor(page, "bora@ornek.test");
    expect(link).toMatch(/^\/reset\?token=/);
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1, name: a.resetTitle })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: a.resetSubmit }).click();
    await expect(page.getByText(a.invalid.password)).toBeVisible();
    await passwordField(page, a.newPassword).fill("yepyeni-bir-sifre");
    await page.getByRole("button", { name: a.resetSubmit }).click();
    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByText(a.resetDone)).toBeVisible();

    await emailField(page).fill("bora@ornek.test");
    await passwordField(page).fill("yepyeni-bir-sifre");
    await page.getByRole("button", { name: a.loginSubmit }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${WS}/pipelines$`));
  });

  test("F01-H4 yönetici kullanıcı davet eder; davetli bağlantıdan adını ve şifresini belirleyip ekibe katılır", async ({ page, browser, baseURL }) => {
    await page.goto(`/w/${WS}/settings/users`);
    const section = page.getByRole("region", { name: inv.title });
    await expect(section.getByText(inv.pendingNone)).toBeVisible();
    await expect(section.getByText(inv.sandbox)).toBeVisible();
    await expectNoA11yViolations(page);
    await section.getByRole("button", { name: inv.submit }).click();
    await expect(section.getByText(a.invalid.email)).toBeVisible();
    await section.getByLabel(new RegExp(`^${inv.email}`)).fill("zeynep@ornek.test");
    await section.getByLabel(inv.name).fill("Zeynep Tan");
    await section.getByRole("button", { name: inv.submit }).click();
    await expect(section.getByText(fill(inv.sent, { email: "zeynep@ornek.test" }))).toBeVisible();
    const row = section.getByRole("listitem").filter({ hasText: "zeynep@ornek.test" });
    await expect(row).toContainText("Zeynep Tan");
    // Koltuk satırı etkin üyeleri sayar; davet kabul edilince dörde çıkar.
    await expect(page.getByText(fill(t.billing.seatLine, { used: 3, seats: 10 }))).toBeVisible();
    await expectNoA11yViolations(page);

    const link = await linkFor(page, "zeynep@ornek.test");
    expect(link).toMatch(/^\/invite\//);
    const guest = await strictPage(browser, baseURL!);
    await guest.page.goto(link);
    await expect(guest.page.getByRole("heading", { level: 1, name: a.inviteTitle })).toBeVisible();
    await expect(guest.page.getByText(fill(a.inviteFrom, { inviter: "Ada Yıldız", workspace: "Örnek Atölye" }))).toBeVisible();
    await expect(guest.page.getByLabel(a.name)).toHaveValue("Zeynep Tan");
    await expectNoA11yViolations(guest.page);
    await passwordField(guest.page).fill("davetli-sifresi");
    await guest.page.getByRole("button", { name: a.inviteSubmit }).click();
    await expect(guest.page).toHaveURL(new RegExp(`/w/${WS}/home$`));
    await expect(guest.page.getByRole("button", { name: fill(a.accountMenu, { name: "Zeynep Tan" }) })).toBeVisible();
    // Davetle gelen adres doğrulanmış sayılır; davetli üyedir, yönetici değil.
    const session = (await (await guest.page.request.get(`/api/w/${WS}/session`)).json()) as { user: { isAdmin: boolean }; emailVerified: boolean };
    expect(session).toMatchObject({ user: { isAdmin: false }, emailVerified: true });
    // Bağlantı ikinci kez kullanılamaz.
    await guest.page.goto(link);
    await expect(guest.page.getByText(a.inviteInvalid)).toBeVisible();
    await guest.context.close();

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "zeynep@ornek.test" })).toContainText("Zeynep Tan");
    await expect(section.getByText(inv.pendingNone)).toBeVisible();
    await expect(page.getByText(fill(t.billing.seatLine, { used: 4, seats: 10 }))).toBeVisible();
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

  test("F01-E3 dar ekranda kayıt, giriş ve şifre sayfaları taşmaz; şifre gösterilip gizlenir", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/signup", "/login", "/forgot", "/reset?token=yok", "/verify"]) {
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

  test.describe("reddedilen istekler", () => {
    test.use({ allow4xx: [401, 403, 404, 409, 410, 422, 429] });

    test("F01-N1 kayıtlı e-postayla ikinci hesap açılmaz; yanlış şifre ile kayıtsız e-posta aynı yanıtı alır", async ({ page, context }) => {
      await signUp(page, { name: "Ada Yıldız", email: "ADA@ornek.test", workspace: "Kopya" });
      await expect(page.getByText(t.errors.email_taken)).toBeVisible();
      await expect(page).toHaveURL(/\/signup$/);

      await context.clearCookies();
      await logIn(page, "yok@ornek.test", "herhangi-bir-sey");
      await expect(page.getByText(t.errors.invalid_login)).toBeVisible();
      await logIn(page, "ada@ornek.test", "yanlis-sifre");
      await expect(page.getByText(t.errors.invalid_login)).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
      // Örnek kullanıcı doğru şifreyle girer.
      await logIn(page, "ada@ornek.test", SEED_PASSWORD);
      await expect(page).toHaveURL(new RegExp(`/w/${WS}/pipelines$`));

      // Sunucu da doğrular: kısa şifre ve bozuk e-posta reddedilir.
      expect((await page.request.post("/api/auth/signup", { data: { name: "x", email: "x@ornek.test", password: "kisa", workspaceName: "X" } })).status()).toBe(422);
      expect((await page.request.post("/api/auth/signup", { data: { name: "x", email: "bozuk", password: PASSWORD, workspaceName: "X" } })).status()).toBe(422);
      // Kayıtsız adrese sıfırlama istenirse yanıt aynıdır ama ileti gitmez.
      const before = (await outbox(page)).length;
      expect(await (await page.request.post("/api/auth/forgot", { data: { email: "yok@ornek.test" } })).json()).toEqual({ sent: true });
      expect((await outbox(page)).length).toBe(before);
      // Uydurma belirteçler.
      expect((await page.request.post("/api/auth/reset", { data: { token: "x".repeat(43), password: PASSWORD } })).status()).toBe(410);
      expect((await page.request.post("/api/auth/verify", { data: { token: "x".repeat(43) } })).status()).toBe(410);
      expect((await page.request.get(`/api/invitations/${"x".repeat(43)}`)).status()).toBe(410);
    });

    test("F01-N2 oturum gerçekten kapanır: çıkıştan ve şifre sıfırlamadan sonra eski oturum geçersizdir; aynı e-postaya çok deneme sınırlanır", async ({ page, browser, baseURL }) => {
      const first = await strictPage(browser, baseURL!);
      // Oturum yokken API 401 döner ve uygulama giriş sayfasına gönderir.
      expect((await first.page.request.get(`/api/w/${WS}/session`)).status()).toBe(401);
      await first.page.goto(`/w/${WS}/pipelines`);
      await expect(first.page).toHaveURL(/\/login$/);

      await logIn(first.page, "cem@ornek.test", SEED_PASSWORD);
      await expect(first.page).toHaveURL(new RegExp(`/w/${WS}/pipelines$`));
      const cookie = (await first.context.cookies()).find((item) => item.name === "leadra_session")!;
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
      expect(cookie.value.length).toBeGreaterThanOrEqual(40);

      // İkinci cihaz.
      const second = await strictPage(browser, baseURL!);
      await logIn(second.page, "cem@ornek.test", SEED_PASSWORD);
      await expect(second.page).toHaveURL(new RegExp(`/w/${WS}/pipelines$`));

      // Çıkış yalnız o cihazın oturumunu kapatır; çerez geri konsa da çalışmaz.
      expect((await first.page.request.post("/api/auth/logout")).status()).toBe(200);
      expect((await first.page.request.get(`/api/w/${WS}/session`)).status()).toBe(401);
      await first.context.addCookies([{ name: cookie.name, value: cookie.value, url: baseURL! }]);
      expect((await first.page.request.get(`/api/w/${WS}/session`)).status()).toBe(401);
      expect((await second.page.request.get(`/api/w/${WS}/session`)).status()).toBe(200);

      // Şifre sıfırlanınca bütün oturumlar düşer.
      await page.request.post("/api/auth/forgot", { data: { email: "cem@ornek.test" } });
      const token = new URL(`http://x${await linkFor(page, "cem@ornek.test")}`).searchParams.get("token")!;
      expect((await page.request.post("/api/auth/reset", { data: { token, password: "sifirlanmis-sifre" } })).status()).toBe(200);
      expect((await second.page.request.get(`/api/w/${WS}/session`)).status()).toBe(401);
      // Sıfırlama bağlantısı tek kullanımlıktır; arayüz de bunu söyler.
      expect((await page.request.post("/api/auth/reset", { data: { token, password: "ucuncu-bir-sifre" } })).status()).toBe(410);
      await second.page.goto(`/reset?token=${token}`);
      await passwordField(second.page, a.newPassword).fill("ucuncu-bir-sifre");
      await second.page.getByRole("button", { name: a.resetSubmit }).click();
      await expect(second.page.getByText(a.resetInvalid)).toBeVisible();

      // Aynı e-postaya on denemeden sonrası sınırlanır (doğru şifre de olsa). Bu testte iki giriş yapıldı: sekiz hak kaldı.
      const attempt = () => first.page.request.post("/api/auth/login", { data: { email: "cem@ornek.test", password: "tahmin" } });
      const statuses: number[] = [];
      for (let index = 0; index < 8; index += 1) statuses.push((await attempt()).status());
      expect(new Set(statuses)).toEqual(new Set([401]));
      expect((await attempt()).status()).toBe(429);
      expect((await first.page.request.post("/api/auth/login", { data: { email: "cem@ornek.test", password: "sifirlanmis-sifre" } })).status()).toBe(429);
      await first.context.close();
      await second.context.close();
    });

    test("F01-N3 davet kuralları: zaten üye, dolu koltuk, geri alınan ve yenilenen bağlantı, hesabı olan davetli, doğrulanmamış davet eden", async ({ page, browser, baseURL, api }) => {
      const invite = (email: string, ws = WS) => page.request.post(`/api/w/${ws}/invitations`, { data: { email, name: "", isAdmin: false, groupId: null } });
      const code = async (response: { json: () => Promise<unknown> }) => ((await response.json()) as { error: { code: string } }).error.code;
      const pending = async () => ((await (await page.request.get(`/api/w/${WS}/invitations`)).json()) as { items: Array<{ id: string; email: string }> }).items;

      expect(await code(await invite("bora@ornek.test"))).toBe("already_member");
      expect((await invite("adres-degil")).status()).toBe(422);

      // Geri alınan davetin bağlantısı çalışmaz.
      expect((await invite("geri@ornek.test")).status()).toBe(201);
      const revokedLink = await linkFor(page, "geri@ornek.test");
      const [toRevoke] = await pending();
      expect((await page.request.delete(`/api/w/${WS}/invitations/${toRevoke.id}`)).status()).toBe(204);
      expect((await page.request.get(`/api${revokedLink.replace("/invite/", "/invitations/")}`)).status()).toBe(410);

      // Yeniden gönderilince eski bağlantı ölür, yenisi çalışır. Aynı adrese ikinci davet yeni kayıt açmaz.
      expect((await invite("yeni@ornek.test")).status()).toBe(201);
      const oldLink = await linkFor(page, "yeni@ornek.test");
      expect((await invite("yeni@ornek.test")).status()).toBe(201);
      expect((await pending()).map((item) => item.email)).toEqual(["yeni@ornek.test"]);
      const [again] = await pending();
      expect((await page.request.post(`/api/w/${WS}/invitations/${again.id}/resend`)).status()).toBe(204);
      const newLink = await linkFor(page, "yeni@ornek.test");
      expect(newLink).not.toBe(oldLink);
      expect((await page.request.get(`/api${oldLink.replace("/invite/", "/invitations/")}`)).status()).toBe(410);
      expect((await page.request.get(`/api${newLink.replace("/invite/", "/invitations/")}`)).status()).toBe(200);

      // Koltuk: üç etkin üye + bir bekleyen davet = 4. Koltuk 4 iken ikinci davet gönderilemez.
      const checkout = await page.request.post(`/api/w/${WS}/billing/checkout`, { data: { seats: 4, period: "month" } });
      const sessionId = ((await checkout.json()) as { url: string }).url.split("/").pop()!;
      await page.request.post("/api/dev/billing/settle", { data: { sessionId, paid: true } });
      expect(await code(await invite("fazla@ornek.test"))).toBe("seat_limit");

      // Hesabı olan davetli (diğer çalışma alanının yöneticisi) kendi şifresiyle katılır; yanlış şifre reddedilir.
      expect((await page.request.delete(`/api/w/${WS}/invitations/${again.id}`)).status()).toBe(204);
      expect((await invite("can@diger.test")).status()).toBe(201);
      const existingLink = await linkFor(page, "can@diger.test");
      const guest = await strictPage(browser, baseURL!);
      await guest.page.goto(existingLink);
      await expect(guest.page.getByText(a.inviteExisting)).toBeVisible();
      await expect(guest.page.getByLabel(a.name)).toHaveCount(0);
      await passwordField(guest.page).fill("yanlis-sifre");
      await guest.page.getByRole("button", { name: a.inviteSubmit }).click();
      await expect(guest.page.getByText(t.errors.invalid_login)).toBeVisible();
      await passwordField(guest.page).fill(SEED_PASSWORD);
      await guest.page.getByRole("button", { name: a.inviteSubmit }).click();
      await expect(guest.page).toHaveURL(new RegExp(`/w/${WS}/home$`));
      await guest.context.close();
      expect(((await api.get("/session")).users as Array<{ name: string }>).map((user) => user.name)).toContain("Can Öz");

      // Doğrulanmamış hesap davet gönderemez; üye de gönderemez.
      const fresh = await strictPage(browser, baseURL!);
      await signUp(fresh.page, { name: "Yeni Sahip", email: "sahip@ornek.test", workspace: "Yeni Yer" });
      await expect(fresh.page).toHaveURL(/\/w\/yeni-yer\/pipelines$/);
      const blocked = await fresh.page.request.post("/api/w/yeni-yer/invitations", { data: { email: "ekip@ornek.test", name: "", isAdmin: false, groupId: null } });
      expect([blocked.status(), await code(blocked)]).toEqual([403, "verify_email_first"]);
      await fresh.page.goto(await linkFor(page, "sahip@ornek.test"));
      await expect(fresh.page.getByText(a.verified)).toBeVisible();
      expect((await fresh.page.request.post("/api/w/yeni-yer/invitations", { data: { email: "ekip@ornek.test", name: "", isAdmin: false, groupId: null } })).status()).toBe(201);
      await fresh.context.close();
    });
  });
});
