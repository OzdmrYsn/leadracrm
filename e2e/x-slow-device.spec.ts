import { expect, t, test, WS } from "./support";

// Yavaş cihazda sayfa içeriği, kabuktan çok sonra etkileşimli hâle gelir. Bu arada oturum verisi çoktan
// gelmiş olur; sunucunun çizdiği HTML ile istemcinin ilk çizimi ayrışırsa düğmeler devre dışı kalabilir.
test.describe("X yavaş cihaz", () => {
  test("X-E9 işlemci 12 kat yavaşken düğmeler devre dışı kalmaz ve uyuşmazlık hatası oluşmaz", async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 12 });

    for (let round = 0; round < 3; round += 1) {
      await page.goto(`/w/${WS}/calendar`);
      await expect(page.getByRole("button", { name: t.tasks.add })).toBeEnabled({ timeout: 30_000 });
      await page.goto(`/w/${WS}/pipelines`);
      await expect(page.getByRole("button", { name: t.pipeline.menu })).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: t.board.addLead })).toBeEnabled({ timeout: 30_000 });
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });
});
