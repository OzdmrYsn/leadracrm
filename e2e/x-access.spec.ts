import { card, expect, gotoBoard, t, test, u, WS } from "./support";

type Summary = { id: string; name: string };

// Arka ucun temel güvencesi: bir kullanıcı başkasının verisini ne ekrandan ne API'den görebilir.
// Kurallar veritabanında (satır düzeyi güvenlik) uygulanır; bu testler uygulamanın onu gerçekten kullandığını sınar.
test.describe("X erişim kuralları", () => {
  test.describe("başka kiracının kullanıcısı", () => {
    test.use({ asUser: "u-can", allow4xx: [404] });

    test("X-N2 başka çalışma alanının üyesi bu çalışma alanından hiçbir şey göremez; kendi verisini görür", async ({ page, api }) => {
      for (const path of ["session", "leads", "contacts", "companies", "tasks", "conversations", "tags", "fields?entity=lead", "pipelines/main/board", "leads/l-kitchen", "contacts/c-deniz"]) {
        expect((await page.request.get(u(`/api/w/${WS}/${path}`))).status(), path).toBe(404);
      }
      expect((await api.patch("/leads/l-kitchen", { name: "Ele geçirildi" })).status).toBe(404);
      expect((await api.post("/leads", { name: "Sızdırılan" })).status).toBe(404);
      expect((await api.post("/notes", { leadId: "l-kitchen", body: "sızma" })).status).toBe(404);

      const own = (await (await page.request.get("/api/w/diger/leads?status=all")).json()) as Summary[];
      expect(own.map((lead) => lead.name)).toEqual(["Gizli teklif"]);

      await page.goto(`/w/${WS}/pipelines`);
      await expect(page.getByText(t.common.notFound)).toBeVisible();
      await expect(page.getByText("Mutfak yenileme")).toHaveCount(0);
    });
  });

  test.describe("kendi çalışma alanının adresiyle başka kiracının kaydı", () => {
    test.use({ allow4xx: [404] });

    test("X-N3 başka kiracının kaydına kendi çalışma alanı üzerinden ulaşılamaz, bağlanılamaz", async ({ api }) => {
      // Kayıt var, ama başka kiracıda: kimliği bilinse bile bulunamadı döner.
      expect((await api.patch("/leads/l-other", { name: "Ele geçirildi" })).status).toBe(404);
      expect((await api.delete("/leads/l-other")).status).toBe(404);
      expect((await api.post("/tasks", { leadId: "l-other", typeId: "tt-follow", dueAt: new Date().toISOString() })).status).toBe(404);
      expect((await api.post("/tasks", { leadId: "l-kitchen", typeId: "tt-other", dueAt: new Date().toISOString() })).status).toBe(404);
      expect((await api.patch("/leads/l-kitchen", { contactId: "c-other" })).status).toBe(404);
      expect((await api.patch("/leads/l-kitchen", { stageId: "s-other-open", expectedStageId: "s-talk" })).status).toBe(404);
      expect((await api.post("/leads", { name: "Yabancı aşamada", stageId: "s-other-open" })).status).toBe(404);
      expect((await api.post("/notes", { leadId: "l-other", body: "sızma" })).status).toBe(404);
      const leads = (await api.get("/leads?status=all")) as Summary[];
      expect(leads.map((lead) => lead.name)).not.toContain("Gizli teklif");
      // Diğer kiracının verisi yerinde ve değişmemiş.
      expect((await api.get("/leads/l-kitchen")).lead.contactId).toBe("c-deniz");
    });
  });

  test.describe("görüntüleme kapsamı kısıtlı üye", () => {
    test.use({ asUser: "u-cem", allow4xx: [403, 404] });

    test("X-N4 kapsamı \"kendi\" olan üye yalnız kendisine atanmış ve atanmamış kayıtları görür", async ({ page, api }) => {
      const leads = (await api.get("/leads?status=all")) as Summary[];
      expect(leads.map((lead) => lead.id)).toEqual(["l-elif"]);
      expect((await page.request.get(u(`/api/w/${WS}/leads/l-kitchen`))).status()).toBe(404);
      expect((await api.patch("/leads/l-kitchen", { name: "Görmediğini değiştirme" })).status).toBe(404);
      expect(((await api.get("/tasks?status=all")) as unknown[]).length).toBe(0);
      expect(((await api.get("/contacts")) as Summary[]).map((contact) => contact.name)).toEqual(["Elif Kaya"]);

      await gotoBoard(page);
      await expect(card(page, "Telegram talebi")).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(1);

      // Talebi kabul edince sahibi olur ve görmeye devam eder.
      expect((await api.post("/leads/l-elif/accept")).status).toBe(200);
      expect((await api.get("/leads/l-elif")).lead.responsibleUserId).toBe("u-cem");
      // Yönetici değil: yapılandırmayı değiştiremez.
      expect((await api.patch("/stages/s-talk", { name: "İzinsiz" })).status).toBe(403);
    });
  });
});
