import { existsSync, readFileSync } from "node:fs";
import { expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, t, test } from "./support";

// Asıl ürünün adları kodda yazılmaz; marka dosyasındaki listeden okunur. Marka dosyası iç nottur ve herkese açık
// depoya girmez: dosya yoksa ad denetimi atlanır, uydurma kanıt denetimi yine çalışır.
const BRAND_FILE = "replica/brand.json";
const hasBrandFile = existsSync(BRAND_FILE);
const avoided = hasBrandFile ? (JSON.parse(readFileSync(BRAND_FILE, "utf8")) as { avoid: string[] }).avoid.map((name) => name.toLocaleLowerCase("tr")) : [];

const l = t.landing;

test.describe("X tanıtım sayfası", () => {
  test("X-L1 ana sayfa açıyı anlatır, kayıt ve girişe götürür, erişilebilirlik taramasından geçer", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(fill(l.metaTitle, { name: t.app.name }));
    await expect(page.getByRole("heading", { level: 1, name: l.hero.title })).toBeVisible();
    await expect(page.getByRole("region", { name: l.play.label })).toBeVisible();
    await expect(page.getByRole("img", { name: l.features.rows[0].alt })).toHaveCount(1);
    await expectNoA11yViolations(page);

    // Bölüm bağlantıları sayfa içinde gezdirir.
    await page.getByRole("navigation", { name: l.nav.label }).getByRole("link", { name: l.nav.faq }).click();
    await expect(page).toHaveURL(/#sorular$/);
    const question = page.getByText(l.faq.items[2].q);
    await question.click();
    await expect(page.getByText(l.faq.items[2].a)).toBeVisible();
    await expectNoA11yViolations(page);

    await page.getByRole("banner").getByRole("link", { name: l.signup }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: l.login }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("X-L4 dokunulabilir pano: aşama adı değişir, kart ilerler, toplamlar güncellenir, baştan başlanır", async ({ page }) => {
    await page.goto("/");
    const play = page.getByRole("region", { name: l.play.label });
    const firstStage = play.getByRole("textbox", { name: fill(l.play.stageName, { n: 1 }) });
    await expect(firstStage).toHaveValue(l.play.stages[0]);
    const columns = play.getByRole("listitem");
    await expect(columns.nth(2)).toContainText("₺185.000");
    await expect(columns.nth(3)).toContainText(l.play.empty);
    await expectNoA11yViolations(page);

    await firstStage.fill("Keşif");
    // Teklif aşamasındaki kart son sütuna geçer; duyuru yapılır, toplamlar yer değiştirir.
    await play.getByRole("button", { name: fill(l.play.advanceLabel, { name: "Toplantı odası" }) }).click();
    await expect(play.getByRole("status")).toHaveText(fill(t.board.moved, { name: "Toplantı odası", stage: l.play.stages[3] }));
    await expect(columns.nth(3)).toContainText("₺185.000");
    await expect(columns.nth(2)).toContainText(l.play.empty);
    await expect(columns.nth(3).getByText(l.play.won, { exact: true })).toBeVisible();
    // İlk sütundan ilerleyen kart, değiştirilen adın değil sıradaki aşamanın adıyla duyurulur.
    await play.getByRole("button", { name: fill(l.play.advanceLabel, { name: "Vestiyer" }) }).click();
    await expect(columns.nth(0)).toContainText("₺41.500");
    await expectNoA11yViolations(page);

    await play.getByRole("button", { name: l.play.reset }).click();
    await expect(firstStage).toHaveValue(l.play.stages[0]);
    await expect(columns.nth(2)).toContainText("₺185.000");
    await expect(play.getByRole("button", { name: l.play.reset })).toBeDisabled();
  });

  test("X-L2 sıradaki kanallar “bağlanır” diye gösterilmez; sayfada uydurma kanıt ve asıl ürünün adı yoktur", async ({ page }) => {
    await page.goto("/");
    const sources = page.getByRole("region", { name: l.sources.title });
    const ready = sources.getByRole("list").first();
    await expect(ready.getByText(t.sources.items.google_sheets.name)).toBeVisible();
    await expect(ready.getByText(t.sources.items.whatsapp.name)).toHaveCount(0);
    await expect(sources.getByRole("list").nth(1).getByText(t.sources.items.whatsapp.name)).toBeVisible();

    const text = (await page.locator("body").innerText()).toLocaleLowerCase("tr");
    if (hasBrandFile) expect(avoided.length).toBeGreaterThan(0);
    for (const banned of [...avoided, "müşteri bize güveniyor", "yıldız", "★"]) expect(text).not.toContain(banned);
  });

  test("X-L3 telefonda taşma yok; çağrı düğmesi görünür ve en az 44 piksel yüksekliğindedir", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
    const cta = page.getByRole("link", { name: l.signup }).first();
    await expect(cta).toBeVisible();
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expectNoHorizontalOverflow(page);
  });
});
