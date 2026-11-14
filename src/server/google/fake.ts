// Yalnız geliştirme: Google'ın OAuth, Drive ve Sheets uçlarının küçük bir taklidi. Gerçek anahtar yokken
// "Google ile bağlan" akışının tamamı (oturum açma, tablo seçme, satır okuma, değişiklik bildirimi) bununla denenir.
// Veriler bu sürecin belleğindedir; gerçek kişi içermez. Üretimde bu dosyaya giden yol kapalıdır.
import { GOOGLE_SCOPE } from "./config";

type FakeSheet = { sheetId: number; title: string; rows: string[][] };
type FakeFile = { id: string; name: string; version: number; sheets: FakeSheet[] };
type FakeChannel = { id: string; fileId: string; address: string; token: string; resourceId: string };
type FakeState = { files: Map<string, FakeFile>; channels: Map<string, FakeChannel>; revoked: boolean; codes: number };

const ACCESS = "dev-access";

function initial(): FakeState {
  const files: FakeFile[] = [
    {
      id: "dev-sheet-reklam",
      name: "Reklam formu yanıtları",
      version: 1,
      sheets: [
        {
          sheetId: 0,
          title: "Form Yanıtları 1",
          rows: [
            ["Zaman damgası", "Ad Soyad", "Telefon", "E-posta", "Tutar", "Hangi ürün"],
            ["14.11.2026 09:12", "Ece Koç", "+90 555 111 22 33", "ece@ornek.test", "18.000", "Vestiyer"],
            ["14.11.2026 10:40", "Tolga Er", "+90 555 222 33 44", "tolga@ornek.test", "", "Mutfak"],
          ],
        },
        { sheetId: 77, title: "Arşiv 'eski'", rows: [["Ad", "Not"]] },
      ],
    },
    { id: "dev-sheet-bayi", name: "Bayi listesi", version: 1, sheets: [{ sheetId: 0, title: "Sayfa1", rows: [["Ad Soyad", "Telefon"]] }] },
  ];
  return { files: new Map(files.map((file) => [file.id, file])), channels: new Map(), revoked: false, codes: 0 };
}

const globalFake = globalThis as typeof globalThis & { __yscFakeGoogle?: FakeState };
const state = () => (globalFake.__yscFakeGoogle ??= initial());

/** Veri sıfırlanırken taklit de ilk hâline döner. */
export function resetFakeGoogle(): void {
  globalFake.__yscFakeGoogle = initial();
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, error: string) => json({ error: { status: error, message: error } }, status);

/** Google'ın yaptığı gibi dosyayı izleyen kanallara boş gövdeli bir bildirim gönderir. */
async function notify(fileId: string): Promise<number> {
  const channels = [...state().channels.values()].filter((channel) => channel.fileId === fileId);
  for (const channel of channels) {
    await fetch(channel.address, {
      method: "POST",
      headers: {
        "X-Goog-Channel-ID": channel.id,
        "X-Goog-Channel-Token": channel.token,
        "X-Goog-Resource-ID": channel.resourceId,
        "X-Goog-Resource-State": "update",
        "X-Goog-Changed": "content",
        "X-Goog-Message-Number": String(Date.now()),
      },
    }).catch(() => undefined);
  }
  return channels.length;
}

export async function fakeGoogle(request: Request, path: string[]): Promise<Response> {
  const url = new URL(request.url);
  const route = path.join("/");
  const store = state();

  if (route === "auth" && request.method === "GET") {
    const target = url.searchParams.get("redirect_uri") ?? "";
    // Açık yönlendirme olmasın: yalnız aynı sunucuya dönülür.
    if (!target.startsWith(`${url.origin}/`)) return fail(400, "redirect_uri_mismatch");
    const back = new URL(target);
    back.searchParams.set("code", `dev-code-${++store.codes}`);
    back.searchParams.set("state", url.searchParams.get("state") ?? "");
    return Response.redirect(back, 302);
  }

  if (route === "token" && request.method === "POST") {
    const body = new URLSearchParams(await request.text());
    if (body.get("grant_type") === "authorization_code") {
      if (!body.get("code")?.startsWith("dev-code-")) return json({ error: "invalid_grant" }, 400);
      store.revoked = false;
      return json({ access_token: ACCESS, refresh_token: "dev-refresh", expires_in: 3600, scope: GOOGLE_SCOPE, token_type: "Bearer" });
    }
    if (store.revoked || body.get("refresh_token") !== "dev-refresh") return json({ error: "invalid_grant" }, 400);
    return json({ access_token: ACCESS, expires_in: 3600, scope: GOOGLE_SCOPE, token_type: "Bearer" });
  }

  // Test kancası: tabloya satır ekler (Google'daki bir kullanıcının yaptığı gibi) ya da erişimi iptal eder.
  if (route === "control" && request.method === "POST") {
    const body = (await request.json()) as { append?: { fileId: string; title?: string; row: string[] }; revoke?: boolean };
    if (body.revoke !== undefined) store.revoked = body.revoke;
    let notified = 0;
    if (body.append) {
      const file = store.files.get(body.append.fileId);
      const sheet = file?.sheets.find((item) => item.title === (body.append?.title ?? file.sheets[0].title));
      if (!file || !sheet) return fail(404, "NOT_FOUND");
      sheet.rows.push(body.append.row);
      file.version += 1;
      notified = await notify(file.id);
    }
    return json({ ok: true, notified });
  }

  if (request.headers.get("authorization") !== `Bearer ${ACCESS}` || store.revoked) return fail(401, "UNAUTHENTICATED");

  if (route === "userinfo") return json({ sub: "dev-google-user", email: "deneme@gmail.test", email_verified: true });

  if (route === "drive/files" && request.method === "GET") {
    return json({ files: [...store.files.values()].map((file) => ({ id: file.id, name: file.name })) });
  }
  if (route === "drive/channels/stop" && request.method === "POST") {
    const body = (await request.json()) as { id: string };
    store.channels.delete(body.id);
    return new Response(null, { status: 204 });
  }
  if (path[0] === "drive" && path[1] === "files" && path[2]) {
    const file = store.files.get(path[2]);
    if (!file) return fail(404, "NOT_FOUND");
    if (path[3] === "watch" && request.method === "POST") {
      const body = (await request.json()) as { id: string; address: string; token: string; expiration?: string };
      const channel = { id: body.id, fileId: file.id, address: body.address, token: body.token, resourceId: `res-${file.id}` };
      store.channels.set(channel.id, channel);
      return json({ kind: "api#channel", id: channel.id, resourceId: channel.resourceId, expiration: body.expiration ?? String(Date.now() + 86_400_000) });
    }
    return json({ id: file.id, name: file.name, version: String(file.version), trashed: false });
  }

  if (path[0] === "sheets" && path[1]) {
    const file = store.files.get(path[1]);
    if (!file) return fail(404, "NOT_FOUND");
    if (path[2] === "values" && path[3]) {
      const match = /^'((?:[^']|'')*)'!A(\d+):ZZ(\d*)$/.exec(decodeURIComponent(path.slice(3).join("/")));
      const sheet = match ? file.sheets.find((item) => item.title === match[1].replace(/''/g, "'")) : undefined;
      if (!match || !sheet) return fail(400, "INVALID_ARGUMENT");
      const from = Number(match[2]);
      const to = match[3] ? Number(match[3]) : sheet.rows.length;
      const values = sheet.rows.slice(from - 1, to);
      return json(values.length > 0 ? { range: match[0], majorDimension: "ROWS", values } : { range: match[0], majorDimension: "ROWS" });
    }
    return json({ sheets: file.sheets.map((sheet, index) => ({ properties: { sheetId: sheet.sheetId, title: sheet.title, index } })) });
  }

  return fail(404, "NOT_FOUND");
}
