import { actAs, card, choose, expect, expectNoA11yViolations, expectNoHorizontalOverflow, fill, gotoBoard, gotoLead, id, t, test, u, WS } from "./support";

type Summary = { id: string; name: string };
type MemberRow = { id: string; isAdmin: boolean; isActive: boolean; groupId: string | null; rights: any };

const FULL = { view: "all", edit: "all", add: true, delete: "all", export: "all" };
const full = { leads: FULL, contacts: FULL, companies: FULL, tasks: { view: "all", edit: "all", delete: "all" }, inbox: { view: "all" } };
const rightsWith = (leads: Partial<typeof FULL>) => ({ ...full, leads: { ...FULL, ...leads } });

const usersPage = `/w/${WS}/settings/users`;
const editButton = (name: string) => fill(t.team.editLabel, { name });
const cell = (entity: string, action: string) => fill(t.access.cell, { entity, action });

test.describe("F13 Kullanıcılar ve yetkiler", () => {
  test("F13-H1 yönetici üyenin yetkilerini matristen değiştirir; üye yeni kapsamı hemen görür", async ({ page, api }) => {
    await page.goto(usersPage);
    await expect(page.getByRole("row", { name: /Cem Kara/ })).toContainText(t.team.roleMember);
    await page.getByRole("button", { name: editButton("Cem Kara") }).click();
    const dialog = page.getByRole("dialog", { name: "Cem Kara" });
    // Mevcut durum: lead'leri yalnız kendisi görür, silemez.
    await expect(dialog.getByRole("radiogroup", { name: cell("Lead'ler", "Görme") }).getByRole("radio", { name: t.access.levels.own })).toBeChecked();
    await expect(dialog.getByRole("radiogroup", { name: cell("Lead'ler", "Silme") }).getByRole("radio", { name: t.access.levels.none })).toBeChecked();

    await dialog.getByRole("radiogroup", { name: cell("Lead'ler", "Görme") }).getByRole("radio", { name: t.access.levels.all }).click();
    await dialog.getByRole("button", { name: t.common.save }).click();
    await expect(dialog).toBeHidden();
    // Odak, pencereyi açan düğmeye döner.
    await expect(page.getByRole("button", { name: editButton("Cem Kara") })).toBeFocused();

    const cem = ((await api.get("/members")) as MemberRow[]).find((member) => member.id === "u-cem")!;
    expect(cem.rights.leads).toMatchObject({ view: "all", edit: "own", add: true, delete: "none" });
    expect(cem.rights.contacts.view).toBe("own");

    await actAs(page, "u-cem");
    const leads = (await api.get("/leads?status=all")) as Summary[];
    expect(leads.map((lead) => lead.name)).toContain("Mutfak yenileme");
    expect(leads.length).toBeGreaterThan(1);
  });

  test("F13-H2 hazır ayar matrisin tamamını doldurur; yönetici yapılan üyenin matrisi gizlenir", async ({ page, api }) => {
    await page.goto(usersPage);
    await page.getByRole("button", { name: editButton("Cem Kara") }).click();
    const dialog = page.getByRole("dialog", { name: "Cem Kara" });
    await dialog.getByRole("button", { name: t.access.presetFull }).click();
    for (const entity of ["Lead'ler", "Kişiler", "Şirketler", "Görevler"]) {
      await expect(dialog.getByRole("radiogroup", { name: cell(entity, "Silme") }).getByRole("radio", { name: t.access.levels.all })).toBeChecked();
    }
    await dialog.getByRole("button", { name: t.access.presetRead }).click();
    await expect(dialog.getByRole("checkbox", { name: cell("Lead'ler", "Ekleme") })).not.toBeChecked();
    await expect(dialog.getByRole("radiogroup", { name: cell("Lead'ler", "Düzenleme") }).getByRole("radio", { name: t.access.levels.none })).toBeChecked();
    await dialog.getByRole("button", { name: t.common.save }).click();
    await expect(dialog).toBeHidden();
    const saved = ((await api.get("/members")) as MemberRow[]).find((member) => member.id === "u-cem")!;
    expect(saved.rights.leads).toMatchObject({ view: "all", edit: "none", add: false, delete: "none" });
    expect(saved.rights.inbox.view).toBe("all");

    // Yönetici yapınca matris yerine açıklama görünür; kayıttan sonra rozet değişir.
    await page.getByRole("button", { name: editButton("Bora Şahin") }).click();
    const bora = page.getByRole("dialog", { name: "Bora Şahin" });
    await bora.getByRole("checkbox", { name: t.team.adminLabel }).click();
    await expect(bora.getByText(t.team.adminRights)).toBeVisible();
    await expect(bora.getByRole("radiogroup")).toHaveCount(0);
    await bora.getByRole("button", { name: t.common.save }).click();
    await expect(page.getByRole("row", { name: /Bora Şahin/ })).toContainText(t.team.roleAdmin);
  });

  test("F13-H3 grup kapsamı: üye, kendi grubundaki kişilerin kayıtlarını görür ve düzenler; başkalarınınkini görmez", async ({ page, api }) => {
    await page.goto(usersPage);
    await page.getByLabel(t.groups.newName).fill("Satış");
    await page.getByRole("button", { name: t.groups.add }).click();
    await expect(page.getByRole("textbox", { name: fill(t.groups.nameOf, { name: "Satış" }) })).toBeVisible();

    // Bora'yı gruba ekrandan, Cem'i API'den al; Cem'in lead kapsamı "grubu".
    await page.getByRole("button", { name: editButton("Bora Şahin") }).click();
    const dialog = page.getByRole("dialog", { name: "Bora Şahin" });
    await choose(page, t.team.groupLabel, "Satış");
    await dialog.getByRole("button", { name: t.common.save }).click();
    await expect(page.getByRole("row", { name: /Bora Şahin/ })).toContainText("Satış");
    await expect(page.getByText(fill(t.groups.members, { count: 1 }))).toBeVisible();

    const group = ((await api.get("/groups")) as Summary[])[0];
    expect((await api.patch("/members/u-cem", { groupId: group.id, rights: rightsWith({ view: "group", edit: "group", delete: "none" }) })).status).toBe(200);

    await actAs(page, "u-cem");
    const names = ((await api.get("/leads?status=all")) as Summary[]).map((lead) => lead.name);
    // Bora'nın lead'leri ve sahipsiz lead görünür; Ada'nınkiler görünmez.
    expect(names).toEqual(expect.arrayContaining(["Kitaplık", "Ofis masaları", "Telegram talebi"]));
    expect(names).not.toContain("Mutfak yenileme");
    expect((await api.patch("/leads/l-shelf", { name: "Kitaplık (grup)" })).status).toBe(200);

    // Bora gruptan çıkınca kayıtları Cem'in kapsamından düşer.
    await actAs(page, null);
    expect((await api.patch("/members/u-bora", { groupId: null })).status).toBe(200);
    await actAs(page, "u-cem");
    expect(((await api.get("/leads?status=all")) as Summary[]).map((lead) => lead.name)).toEqual(["Telegram talebi"]);
  });

  test("F13-H4 grup yeniden adlandırılır ve silinir; üyeleri grupsuz kalır", async ({ page, api }) => {
    const created = await api.post("/groups", { name: "Destek" });
    expect(created.status).toBe(201);
    expect((await api.patch("/members/u-bora", { groupId: created.body.id })).status).toBe(200);
    await page.goto(usersPage);
    const name = page.getByRole("textbox", { name: fill(t.groups.nameOf, { name: "Destek" }) });
    await name.fill("Müşteri destek");
    await name.press("Enter");
    await expect(page.getByRole("row", { name: /Bora Şahin/ })).toContainText("Müşteri destek");

    await page.getByRole("button", { name: fill(t.groups.remove, { name: "Müşteri destek" }) }).click();
    await page.getByRole("button", { name: t.groups.removeConfirm }).click();
    await expect(page.getByText(t.groups.none)).toBeVisible();
    await expect(page.getByRole("row", { name: /Bora Şahin/ })).toContainText(t.team.noGroup);
    expect(((await api.get("/members")) as MemberRow[]).find((member) => member.id === "u-bora")!.groupId).toBeNull();
  });

  test("F13-E1 klavyeyle: ok tuşları düzeyi değiştirir, Esc kaydetmeden kapatır", async ({ page, api }) => {
    await page.goto(usersPage);
    const open = page.getByRole("button", { name: editButton("Cem Kara") });
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Cem Kara" });
    const view = dialog.getByRole("radiogroup", { name: cell("Kişiler", "Görme") });
    await view.getByRole("radio", { name: t.access.levels.own }).focus();
    // Radix odağı tuş basılıyken taşır ve o sırada seçer; tuş gerçek bir basış kadar basılı tutulur.
    await page.keyboard.press("ArrowRight", { delay: 100 });
    await expect(view.getByRole("radio", { name: t.access.levels.group })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
    expect(((await api.get("/members")) as MemberRow[]).find((member) => member.id === "u-cem")!.rights.contacts.view).toBe("own");
  });

  test("F13-E2 erişilebilirlik ve dar ekran: kullanıcılar ekranı ve yetki penceresi", async ({ page }) => {
    await page.goto(usersPage);
    await expect(page.getByRole("heading", { name: t.team.title })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole("button", { name: editButton("Cem Kara") }).click();
    await expect(page.getByRole("dialog", { name: "Cem Kara" })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: editButton("Cem Kara") }).click();
    const dialog = page.getByRole("dialog", { name: "Cem Kara" });
    // Kaydet düğmesi matris kaydırılmadan görünür.
    await expect(dialog.getByRole("button", { name: t.common.save })).toBeInViewport();
    await expectNoHorizontalOverflow(page);
  });

  test.describe("kısıtlamalar", () => {
    test.use({ allow4xx: [403, 404, 422] });

    test("F13-N1 görmesi \"tümü\", düzenlemesi \"kendi\" olan üye başkasının lead'ini açar ama değiştiremez", async ({ page, api }) => {
      expect((await api.patch("/members/u-cem", { rights: rightsWith({ view: "all", edit: "own", delete: "own" }) })).status).toBe(200);
      await actAs(page, "u-cem");

      const denied = await api.patch("/leads/l-kitchen", { name: "İzinsiz" });
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("no_permission");
      expect((await page.request.put(u(`/api/w/${WS}/leads/l-kitchen/tags`), { data: { tagIds: [id("t-vip")] } })).status()).toBe(403);
      expect((await api.delete("/leads/l-kitchen")).status).toBe(403);
      expect((await api.get("/leads/l-kitchen")).lead.name).toBe("Mutfak yenileme");

      // Ekran: uyarı görünür, silme menüsü yoktur.
      await gotoLead(page, "l-kitchen");
      await expect(page.getByText(t.lead.readOnly)).toBeVisible();
      await expect(page.getByRole("button", { name: t.leadMenu.label })).toHaveCount(0);

      // Kendi lead'ini düzenler ve siler.
      const mine = await api.post("/leads", { name: "Cem'in lead'i" });
      expect(mine.status).toBe(201);
      expect((await api.patch(`/leads/${mine.body.id}`, { name: "Cem'in lead'i (düzeltildi)" })).status).toBe(200);
      await page.goto(`/w/${WS}/leads/${mine.body.id}`);
      await expect(page.getByRole("button", { name: t.leadMenu.label })).toBeVisible();
      await expect(page.getByText(t.lead.readOnly)).toHaveCount(0);
      expect((await api.delete(`/leads/${mine.body.id}`)).status).toBe(204);
    });

    test("F13-N2 ekleme yetkisi olmayan üye lead, kişi, şirket oluşturamaz; ekleme düğmeleri görünmez", async ({ page, api }) => {
      const none = { ...FULL, add: false };
      expect((await api.patch("/members/u-cem", { rights: { ...full, leads: none, contacts: none, companies: none } })).status).toBe(200);
      await actAs(page, "u-cem");
      for (const [path, body] of [
        ["/leads", { name: "İzinsiz lead" }],
        ["/contacts", { name: "İzinsiz kişi" }],
        ["/companies", { name: "İzinsiz şirket" }],
      ] as const) {
        const response = await api.post(path, body);
        expect(response.status, path).toBe(403);
        expect(response.body.error.code).toBe("no_permission");
      }
      await gotoBoard(page);
      await expect(card(page, "Mutfak yenileme")).toBeVisible();
      await expect(page.getByRole("button", { name: t.board.addLead })).toHaveCount(0);
      await page.goto(`/w/${WS}/contacts`);
      await expect(page.getByRole("link", { name: "Deniz Arslan" })).toBeVisible();
      await expect(page.getByRole("button", { name: t.contacts.add })).toHaveCount(0);
    });

    test("F13-N3 silme yetkisi \"yok\" olan üye kendi lead'ini ve görevini de silemez", async ({ page, api }) => {
      await actAs(page, "u-cem");
      const lead = await api.post("/leads", { name: "Silinemeyen" });
      expect(lead.status).toBe(201);
      const task = await api.post("/tasks", { leadId: lead.body.id, typeId: "tt-follow", dueAt: new Date(Date.now() + 3_600_000).toISOString() });
      expect(task.status).toBe(201);
      expect((await api.delete(`/tasks/${task.body.id}`)).status).toBe(403);
      expect((await api.delete(`/leads/${lead.body.id}`)).status).toBe(403);
      // Düzenleme yetkisi var: görevi tamamlayabilir.
      expect((await api.post(`/tasks/${task.body.id}/complete`, { resultText: "Arandı" })).status).toBe(200);
    });

    test("F13-E3 kapsamı \"kendi\" olan üye lead'ini, görevini ve kişisini iş arkadaşına devredebilir; devrettiğini artık göremez", async ({ page, api }) => {
      await actAs(page, "u-cem");
      // Başkası adına oluşturma: lead ve görev.
      const forBora = await api.post("/leads", { name: "Bora için lead", responsibleUserId: "u-bora" });
      expect(forBora.status).toBe(201);
      expect(forBora.body.responsibleUserId).toBe("u-bora");
      expect((await page.request.get(`/api/w/${WS}/leads/${forBora.body.id}`)).status()).toBe(404);

      const mine = await api.post("/leads", { name: "Devredilecek" });
      const due = new Date(Date.now() + 3_600_000).toISOString();
      const task = await api.post("/tasks", { leadId: mine.body.id, typeId: "tt-follow", dueAt: due, responsibleUserId: "u-bora" });
      expect(task.status).toBe(201);
      expect(task.body.responsible.id).toBe("u-bora");
      const own = await api.post("/tasks", { leadId: mine.body.id, typeId: "tt-follow", dueAt: due });
      expect((await api.patch(`/tasks/${own.body.id}`, { responsibleUserId: "u-bora" })).status).toBe(200);
      expect(((await api.get("/tasks?status=all")) as unknown[]).length).toBe(0);

      const contact = await api.post("/contacts", { name: "Devredilecek kişi" });
      const moved = await api.patch(`/contacts/${contact.body.id}`, { responsibleUserId: "u-bora" });
      expect(moved.status).toBe(200);
      expect(moved.body.responsibleUserId).toBe("u-bora");

      // Lead'i devreder: yanıt yeni sorumluyu gösterir, sonra lead kapsamından çıkar.
      const handed = await api.patch(`/leads/${mine.body.id}`, { responsibleUserId: "u-bora" });
      expect(handed.status).toBe(200);
      expect(handed.body.responsibleUserId).toBe("u-bora");
      expect((await page.request.get(`/api/w/${WS}/leads/${mine.body.id}`)).status()).toBe(404);
      // Devrettiği kaydı geri alamaz: artık göremiyor.
      expect((await api.patch(`/leads/${mine.body.id}`, { responsibleUserId: "u-cem" })).status).toBe(404);

      // Yeni sorumlu hepsini görür.
      await actAs(page, "u-bora");
      const names = ((await api.get("/leads?status=all")) as Summary[]).map((lead) => lead.name);
      expect(names).toEqual(expect.arrayContaining(["Bora için lead", "Devredilecek"]));
      expect(((await api.get(`/tasks?status=all&lead=${mine.body.id}`)) as unknown[]).length).toBe(2);
    });

    test("F13-N4 yönetici olmayan üye ekibi, grupları ve çalışma alanını değiştiremez; yetki matrisini göremez", async ({ page, api }) => {
      await actAs(page, "u-cem");
      expect((await api.patch("/members/u-cem", { isAdmin: true })).status).toBe(403);
      expect((await api.patch("/members/u-cem", { rights: full })).status).toBe(403);
      expect((await api.post("/groups", { name: "İzinsiz" })).status).toBe(403);
      expect((await api.patch("/workspace", { name: "Ele geçirildi" })).status).toBe(403);
      const members = (await api.get("/members")) as MemberRow[];
      expect(members.every((member) => member.rights === null)).toBe(true);

      await page.goto(usersPage);
      await expect(page.getByText(t.team.adminOnly)).toBeVisible();
      await expect(page.getByRole("row", { name: /Bora Şahin/ })).toBeVisible();
      await expect(page.getByRole("button", { name: editButton("Bora Şahin") })).toHaveCount(0);
      await expect(page.getByLabel(t.groups.newName)).toHaveCount(0);
      expect((await api.get("/session")).user.isAdmin).toBe(false);
    });

    test("F13-N5 yönetici kendi yöneticiliğini kaldıramaz, kendini pasifleştiremez; başka yönetici yapabilir", async ({ page, api }) => {
      for (const body of [{ isAdmin: false }, { isActive: false }]) {
        const response = await api.patch("/members/u-ada", body);
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe("self_change");
      }
      await page.goto(usersPage);
      await page.getByRole("button", { name: editButton("Ada Yıldız") }).click();
      const dialog = page.getByRole("dialog", { name: "Ada Yıldız" });
      await expect(dialog.getByText(t.team.selfNote)).toBeVisible();
      await expect(dialog.getByRole("checkbox", { name: t.team.adminLabel })).toBeDisabled();
      await expect(dialog.getByRole("checkbox", { name: t.team.activeLabel })).toBeDisabled();
      await page.keyboard.press("Escape");

      // İkinci yönetici, ilkinin yöneticiliğini kaldırabilir: çalışma alanında hâlâ bir yönetici var.
      expect((await api.patch("/members/u-bora", { isAdmin: true })).status).toBe(200);
      await actAs(page, "u-bora");
      expect((await api.patch("/members/u-ada", { isAdmin: false })).status).toBe(200);
      expect((await api.get("/session")).user.isAdmin).toBe(true);
    });

    test("F13-N6 pasifleştirilen üye çalışma alanına giremez; kayıtları yerinde kalır; yeniden etkinleştirilebilir", async ({ page, api }) => {
      expect((await api.patch("/members/u-bora", { isActive: false })).status).toBe(200);
      expect((await api.get("/leads/l-shelf")).lead.responsibleUserId).toBe("u-bora");
      // Pasif üye sorumlu seçilemez.
      expect((await api.patch("/leads/l-kitchen", { responsibleUserId: "u-bora" })).status).toBe(404);

      await actAs(page, "u-bora");
      expect((await page.request.get(u(`/api/w/${WS}/session`))).status()).toBe(404);
      await page.goto(`/w/${WS}/pipelines`);
      await expect(page.getByText(t.common.notFound)).toBeVisible();

      await actAs(page, null);
      await page.goto(usersPage);
      await expect(page.getByRole("row", { name: /Bora Şahin/ })).toContainText(t.team.inactive);
      await page.getByRole("button", { name: editButton("Bora Şahin") }).click();
      const dialog = page.getByRole("dialog", { name: "Bora Şahin" });
      await dialog.getByRole("checkbox", { name: t.team.activeLabel }).click();
      await dialog.getByRole("button", { name: t.common.save }).click();
      await expect(page.getByRole("row", { name: /Bora Şahin/ })).toContainText(t.team.active);
    });

    test("F13-N7 geçersiz girdiler: eksik matris, olmayan grup, olmayan üye, başka kiracının üyesi", async ({ api }) => {
      expect((await api.patch("/members/u-cem", { rights: { leads: FULL } })).status).toBe(422);
      expect((await api.patch("/members/u-cem", { rights: rightsWith({ view: "herkes" as never }) })).status).toBe(422);
      expect((await api.patch("/members/u-cem", { groupId: "g-yok" })).status).toBe(404);
      expect((await api.patch("/members/u-yok", { isActive: false })).status).toBe(404);
      expect((await api.patch("/members/u-can", { isAdmin: true })).status).toBe(404);
      expect((await api.post("/groups", { name: "   " })).status).toBe(422);
      expect((await api.post("/groups", { name: "a".repeat(81) })).status).toBe(422);
    });
  });
});
