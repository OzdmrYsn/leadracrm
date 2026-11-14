import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { tr } from "../src/i18n/tr";

export { expect };
export const t = tr;
export const WS = "demo";

/* ---------- örnek verinin kimlikleri ----------
 * Veritabanındaki kimlikler uuid'dir. Örnek veri (supabase/seed.sql) her kaydı okunur bir anahtardan
 * (l-kitchen, c-deniz, s-talk ...) uuid v5 ile türetir; testler aynı anahtarları kullanır.
 * API yardımcısı isteklerde anahtarı uuid'ye, yanıtlarda uuid'yi anahtara çevirir; böylece testler
 * "l-kitchen" yazmaya devam eder.
 */
const NAMESPACE = "6f1d3c5e-0b7a-4d59-9c36-2a4f8e1b7d10";
const SEED_KEYS = ["u-ada", "u-bora", "ws-demo", "p-sales", "s-in", "s-first", "s-talk", "s-offer", "s-won", "s-lost", "src-manual", "tt-follow", "tt-meeting", "t-urgent", "t-dealer", "t-vip", "t-callback", "f-source", "o-insta", "o-ref", "o-web", "f-delivery", "f-title", "f-site", "ch-tg", "ch-wa", "co-aksoy", "co-kuzey", "c-deniz", "c-elif", "c-mert", "c-okan", "c-selin", "l-elif", "l-kitchen", "l-wardrobe", "l-office", "l-desks", "l-shelf", "cv-elif", "m-1", "m-2", "cv-deniz", "m-3", "m-4", "m-5", "m-6", "cv-mert", "m-7", "m-8", "e-3", "e-1", "n-1", "e-2", "k-5", "k-3", "k-2", "k-1", "k-4", "lr-price", "lr-rival", "lr-silent", "lr-need", "u-cem", "u-can", "ws-other", "p-other", "s-other-in", "s-other-open", "s-other-won", "s-other-lost", "tt-other", "c-other", "l-other"];

/** Anahtarın uuid'si (uuid v5). Bilinmeyen bir anahtar da geçerli ama var olmayan bir uuid verir. */
export function id(key: string): string {
  const hash = createHash("sha1").update(Buffer.from(NAMESPACE.replace(/-/g, ""), "hex")).update(key).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const KEY_BY_ID = new Map(SEED_KEYS.map((key) => [id(key), key]));
const KNOWN = new Set(SEED_KEYS);
/** Örnek verideki bir anahtar ya da "olmayan kayıt" için kullanılan *-yok anahtarı. */
const isKey = (value: string) => KNOWN.has(value) || /^[a-z]+-yok$/.test(value);

function mapDeep(value: unknown, convert: (text: string) => string): unknown {
  if (typeof value === "string") return convert(value);
  if (Array.isArray(value)) return value.map((item) => mapDeep(item, convert));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [convert(key), mapDeep(item, convert)]));
  }
  return value;
}

const toDb = (value: unknown) => mapDeep(value, (text) => (isKey(text) ? id(text) : text));
const fromDb = (value: unknown): any => mapDeep(value, (text) => KEY_BY_ID.get(text) ?? text);

/** Adresteki anahtarları uuid'ye çevirir: "/leads/l-kitchen?c=cv-deniz". */
export const u = (address: string) =>
  address
    .split(/([/?&=,])/)
    .map((part) => (isKey(part) ? id(part) : part))
    .join("");

/** "{ad}" yer tutucularını doldurur (uygulamadaki fill ile aynı kural). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

type Problems = { console: string[]; server: string[]; client: string[] };

type Fixtures = {
  /** Bu testte beklenen 4xx yanıt kodları (bilerek gönderilen geçersiz girdiler). */
  allow4xx: number[];
  /** Oturumdaki kullanıcı. Varsayılan yönetici. */
  asUser: string | undefined;
  problems: Problems;
  api: Api;
};

export type Api = {
  get: <T = any>(path: string) => Promise<T>;
  post: <T = any>(path: string, body?: unknown) => Promise<{ status: number; body: T }>;
  patch: <T = any>(path: string, body?: unknown) => Promise<{ status: number; body: T }>;
  inbound: (input: { externalChatId?: string; contactName?: string; text?: string }) => Promise<{ status: number; body: any }>;
  delete: (path: string) => Promise<{ status: number; body: any }>;
};

function makeApi(request: APIRequestContext): Api {
  const base = `/api/w/${WS}`;
  const send = async (method: "post" | "patch", url: string, body?: unknown) => {
    const response = await request[method](u(url), { data: toDb(body ?? {}) as object });
    const text = await response.text();
    return { status: response.status(), body: text ? fromDb(JSON.parse(text)) : null };
  };
  return {
    get: async (path) => {
      const response = await request.get(u(`${base}${path}`));
      expect(response.status(), `GET ${path}`).toBe(200);
      return fromDb(await response.json());
    },
    post: (path, body) => send("post", `${base}${path}`, body),
    patch: (path, body) => send("patch", `${base}${path}`, body),
    inbound: (input) => send("post", "/api/dev/simulate-inbound", { ws: WS, ...input }),
    delete: async (path) => {
      const response = await request.delete(u(`${base}${path}`));
      const text = await response.text();
      return { status: response.status(), body: text ? fromDb(JSON.parse(text)) : null };
    },
  };
}

/**
 * Her test: örnek veriyi sıfırlar; konsol hatası, yakalanmamış sayfa hatası ve 5xx yanıtı görürse başarısız olur.
 * Bilerek tetiklenen 4xx yanıtları test.use({ allow4xx: [422] }) ile bildirilir.
 */
export const test = base.extend<Fixtures>({
  allow4xx: [[], { option: true }],
  asUser: [undefined, { option: true }],

  // İstekler sayfanın bağlamından gider; geliştirme oturumu çerezi tarayıcıyla ortaktır.
  api: async ({ page }, use) => {
    await use(makeApi(page.request));
  },

  problems: [
    async ({ page, allow4xx, asUser }, use) => {
      const reset = await page.request.post("/api/dev/reset", { data: asUser ? { userId: id(asUser) } : {} });
      expect(reset.status(), "store reset").toBe(200);

      const problems: Problems = { console: [], server: [], client: [] };
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        // Tarayıcı her 4xx/5xx yanıtını konsola da yazar; bunlar yanıt dinleyicisinde değerlendirilir.
        if (text.startsWith("Failed to load resource")) return;
        problems.console.push(text);
      });
      page.on("pageerror", (error) => problems.console.push(`pageerror: ${error.message}`));
      page.on("response", (response) => {
        const status = response.status();
        const url = response.url();
        if (status >= 500) problems.server.push(`${status} ${response.request().method()} ${url}`);
        else if (status >= 400 && url.includes("/api/") && !allow4xx.includes(status)) {
          problems.client.push(`${status} ${response.request().method()} ${url}`);
        }
      });

      await use(problems);

      expect(problems.server, "5xx yanıtı").toEqual([]);
      expect(problems.console, "konsol hatası").toEqual([]);
      expect(problems.client, "beklenmeyen 4xx yanıtı").toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Geliştirme oturumunu veriyi sıfırlamadan başka bir kullanıcıya geçirir (null: varsayılan yönetici).
 * Bir test içinde "yönetici ayarlar, üye dener" akışı için.
 */
export async function actAs(page: Page, userKey: string | null) {
  const context = page.context();
  await context.clearCookies({ name: "ysc-dev-user" });
  if (userKey) await context.addCookies([{ name: "ysc-dev-user", value: id(userKey), url: test.info().project.use.baseURL! }]);
}

/** axe taraması. Next.js geliştirme göstergesi uygulamanın parçası değildir; dışarıda tutulur. */
export async function expectNoA11yViolations(page: Page, context?: string) {
  const builder = new AxeBuilder({ page }).exclude("nextjs-portal").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (context) builder.include(context);
  const results = await builder.analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
  }));
  expect(summary, "erişilebilirlik ihlali").toEqual([]);
}

/** Sayfa yatayda taşmamalı. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "yatay taşma (piksel)").toBeLessThanOrEqual(0);
}

export const main = (page: Page) => page.locator("#main");

/* ---------- ekran yardımcıları ---------- */

export const STAGE = { incoming: "Gelen talepler", first: "İlk temas", talk: "Görüşme", offer: "Teklif", won: "Kazanıldı", lost: "Kaybedildi" } as const;

export async function gotoBoard(page: Page) {
  await page.goto(`/w/${WS}/pipelines`);
  await expect(column(page, STAGE.first)).toBeVisible();
}

export async function gotoLead(page: Page, leadId: string) {
  await page.goto(u(`/w/${WS}/leads/${leadId}`));
  await expect(page.getByRole("region", { name: t.lead.details })).toBeVisible();
}

/** Panodaki bir aşama sütunu. */
export const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Panodaki bir lead kartı (ada göre). Sayfada ya da bir sütunun içinde aranır. */
export function card(scope: Page | Locator, name: string): Locator {
  // "has" içindeki arama kartın kendisine göre yapılır; bu yüzden sayfa kökünden kurulur.
  const page = "page" in scope ? scope.page() : scope;
  return scope.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

/** Radix seçim kutusunda bir seçenek seçer. */
export async function choose(page: Page, label: string | RegExp, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Lead kartındaki yazışma akışı (mesajlar, notlar, olaylar). Yazma kutusu bunun dışındadır. */
export const feed = (page: Page) => page.getByRole("list", { name: t.lead.feed });
