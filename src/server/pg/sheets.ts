// Google hesabıyla bağlanan tablolar: hesap kaydı, tablo bağlama ve satırların lead'e çevrilmesi.
// Google çağrıları veritabanı işlemlerinin dışında yapılır; böylece bir Google hatası yarım kalmış bir işlem bırakmaz
// ve "yeniden bağlanın" durumu hata olsa da kaydedilir.
import { createHash, randomBytes } from "node:crypto";
import type { GoogleAccount, Id, Intake, SheetInspection, SheetLink } from "@/lib/types";
import { asService } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { fileMeta, GoogleError, listTabs, readRows, refreshAccess, watchFile } from "../google/client";
import type { GoogleConfig } from "../google/config";
import { seal, unseal } from "../secret-box";
import { inWorkspace, requireAdmin } from "./ctx";
import { insertIntake, receiveForIntake } from "./intake";

const MAX_ROWS_PER_SYNC = 500;
const MAX_COLUMNS = 60;
const CHANNEL_LIFETIME_MS = 23 * 60 * 60 * 1000;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/* ---------- erişim anahtarı ---------- */

const globalTokens = globalThis as typeof globalThis & { __yscGoogleTokens?: Map<string, { token: string; expires: number }> };
const tokens = () => (globalTokens.__yscGoogleTokens ??= new Map());

export function resetGoogleTokens(): void {
  tokens().clear();
}

/** Google'dan gelen hatayı ekranda anlamlı bir iletiye çevrilecek koda dönüştürür. */
function upstream(error: unknown): DataError {
  if (error instanceof DataError) return error;
  if (error instanceof GoogleError) {
    if (error.status === 404) return new DataError(404, "google_file_missing", "the spreadsheet is no longer available to this account");
    if (error.status === 429) return new DataError(429, "google_busy", "google rate limit reached");
    return new DataError(502, "google_failed", `google answered ${error.status} ${error.reason}`);
  }
  return new DataError(502, "google_failed", "google request failed");
}

/** Hesabın kısa ömürlü erişim anahtarı. Erişim iptal edilmişse hesap "yeniden bağlanın" durumuna alınır. */
async function accessToken(cfg: GoogleConfig, accountId: Id): Promise<string> {
  const cached = tokens().get(accountId);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const [account] = await asService((sql) => sql<Array<{ refreshTokenEnc: string }>>`select refresh_token_enc from google_accounts where id = ${accountId}`);
  if (!account) throw notFound("google account");
  try {
    const fresh = await refreshAccess(cfg, unseal(account.refreshTokenEnc));
    tokens().set(accountId, { token: fresh.accessToken, expires: Date.now() + fresh.expiresIn * 1000 });
    await asService((sql) => sql`update google_accounts set status = 'active' where id = ${accountId} and status <> 'active'`);
    return fresh.accessToken;
  } catch (error) {
    if (error instanceof GoogleError && (error.reason === "invalid_grant" || error.status === 401)) {
      tokens().delete(accountId);
      await asService((sql) => sql`update google_accounts set status = 'reconnect' where id = ${accountId}`);
      throw new DataError(409, "google_reconnect", "google access was revoked or expired");
    }
    throw upstream(error);
  }
}

/**
 * Erişim anahtarıyla bir Google çağrısı yapar. Google anahtarı tanımazsa (401) bellekteki anahtar atılır ve
 * bir kez yenisiyle denenir; izin gerçekten kalkmışsa yenileme "yeniden bağlanın" hatasıyla sonuçlanır.
 */
async function withAccess<T>(cfg: GoogleConfig, accountId: Id, work: (token: string) => Promise<T>): Promise<T> {
  const token = await accessToken(cfg, accountId);
  try {
    return await work(token);
  } catch (error) {
    if (!(error instanceof GoogleError) || error.status !== 401) throw error;
    tokens().delete(accountId);
    return work(await accessToken(cfg, accountId));
  }
}

/* ---------- hesaplar (yalnız yönetici) ---------- */

async function adminAccount(ws: string, accountId: Id): Promise<{ id: Id; workspaceId: Id }> {
  if (!isUuid(accountId)) throw notFound("google account");
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const [account] = await ctx.system(() => ctx.sql<Array<{ id: Id; workspaceId: Id }>>`select id, workspace_id from google_accounts where id = ${accountId} and workspace_id = ${ctx.ws.id}`);
    if (!account) throw notFound("google account");
    return account;
  });
}

export function listGoogleAccounts(ws: string): Promise<GoogleAccount[]> {
  return inWorkspace(ws, async (ctx) => {
    if (!ctx.user.isAdmin) return [];
    return ctx.system(async () => [...(await ctx.sql<GoogleAccount[]>`select id, email, status from google_accounts where workspace_id = ${ctx.ws.id} order by created_at, id`)]);
  });
}

/** OAuth dönüşünde hesabı kaydeder. Aynı Google hesabı yeniden bağlanırsa anahtarı yenilenir. */
export function saveGoogleAccount(ws: string, input: { sub: string; email: string; refreshToken: string; scope: string }): Promise<Id> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const [saved] = await ctx.system(
      () => ctx.sql<Array<{ id: Id }>>`
        insert into google_accounts (workspace_id, google_sub, email, refresh_token_enc, scope, created_by)
        values (${ctx.ws.id}, ${input.sub}, ${input.email}, ${seal(input.refreshToken)}, ${input.scope}, ${ctx.user.id})
        on conflict (workspace_id, google_sub) do update
          set email = excluded.email, refresh_token_enc = excluded.refresh_token_enc, scope = excluded.scope, status = 'active'
        returning id`,
    );
    tokens().delete(saved.id);
    return saved.id;
  });
}

/** Google dosya seçicisine verilecek kısa ömürlü anahtar. Yalnız yönetici alır. */
export async function pickerToken(ws: string, accountId: Id, cfg: GoogleConfig): Promise<string> {
  const account = await adminAccount(ws, accountId);
  return accessToken(cfg, account.id);
}

/* ---------- tabloyu tanıma ---------- */

/** Seçilen tablonun sayfalarını ve her sayfanın başlık satırını getirir. */
export async function inspectSpreadsheet(ws: string, accountId: Id, spreadsheetId: string, cfg: GoogleConfig): Promise<SheetInspection> {
  const account = await adminAccount(ws, accountId);
  try {
    return await withAccess(cfg, account.id, async (token) => {
      const meta = await fileMeta(cfg, token, spreadsheetId);
      const tabs = await listTabs(cfg, token, spreadsheetId);
      const withHeaders = [];
      for (const tab of tabs.slice(0, 20)) {
        const [header = []] = await readRows(cfg, token, spreadsheetId, tab.title, 1, 1);
        withHeaders.push({ sheetId: tab.sheetId, title: tab.title, header: header.slice(0, MAX_COLUMNS).filter((cell) => cell.trim() !== "") });
      }
      return { spreadsheetId, name: meta.name, tabs: withHeaders };
    });
  } catch (error) {
    throw upstream(error);
  }
}

/* ---------- bağlama ---------- */

export type SheetLinkInput = { accountId: Id; spreadsheetId: string; sheetId: number; name: string; stageId: Id; tagId?: Id | null; importExisting?: boolean };

export async function createSheetLink(ws: string, input: SheetLinkInput, cfg: GoogleConfig, hook: string | null): Promise<{ intake: Intake; imported: number }> {
  const account = await adminAccount(ws, input.accountId);
  const { meta, title, filled } = await withAccess(cfg, account.id, async (token) => {
    const found = await fileMeta(cfg, token, input.spreadsheetId);
    const tab = (await listTabs(cfg, token, input.spreadsheetId)).find((item) => item.sheetId === input.sheetId);
    if (!tab) throw new DataError(422, "validation", "the selected sheet tab does not exist");
    return { meta: found, title: tab.title, filled: (await readRows(cfg, token, input.spreadsheetId, tab.title, 1)).length };
  }).catch((error: unknown) => {
    throw upstream(error);
  });
  if (filled === 0) throw new DataError(422, "sheet_no_header", "the first row of the sheet must contain column headers");

  const created = await inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const intake = await insertIntake(ctx, { name: input.name, kind: "google_sheets", provider: "google_sheets", stageId: input.stageId, tagId: input.tagId ?? null });
    const [link] = await ctx.system(
      () => ctx.sql<Array<{ id: Id }>>`
        insert into sheet_links (workspace_id, intake_id, google_account_id, spreadsheet_id, spreadsheet_name, sheet_id, sheet_title, last_row, drive_version)
        values (${ctx.ws.id}, ${intake.id}, ${account.id}, ${input.spreadsheetId}, ${meta.name.slice(0, 500)}, ${input.sheetId}, ${title}, ${input.importExisting ? 1 : filled}, ${input.importExisting ? null : meta.version})
        returning id`,
    );
    return { intake, linkId: link.id };
  });

  const imported = input.importExisting ? (await syncLink(created.linkId, cfg, { force: true })).created : 0;
  if (hook) await startWatch(created.linkId, cfg, hook).catch(() => undefined); // bildirim kurulamazsa yoklama yeter
  return { intake: created.intake, imported };
}

/** Google'dan bu dosya için değişiklik bildirimi ister. Kanal en çok bir gün yaşar; süresi dolmadan yenilenir. */
async function startWatch(linkId: Id, cfg: GoogleConfig, hook: string): Promise<void> {
  const [link] = await asService((sql) => sql<Array<{ googleAccountId: Id; spreadsheetId: string }>>`select google_account_id, spreadsheet_id from sheet_links where id = ${linkId}`);
  if (!link) return;
  const secret = randomBytes(24).toString("base64url");
  const channelId = `sheet-${randomBytes(16).toString("hex")}`;
  const channel = await withAccess(cfg, link.googleAccountId, (token) =>
    watchFile(cfg, token, link.spreadsheetId, { id: channelId, address: hook, token: secret, expiration: Date.now() + CHANNEL_LIFETIME_MS }),
  );
  await asService(
    (sql) => sql`
      update sheet_links set channel_id = ${channelId}, channel_resource_id = ${channel.resourceId}, channel_token_hash = ${hash(secret)},
        channel_expires_at = ${new Date(channel.expiration)} where id = ${linkId}`,
  );
}

/* ---------- eşitleme ---------- */

type LinkRow = { id: Id; intakeId: Id; googleAccountId: Id; spreadsheetId: string; sheetId: number; sheetTitle: string; lastRow: number; driveVersion: string | null; isActive: boolean };

/**
 * Tablodaki yeni satırları lead'e çevirir. Dosyanın sürümü değişmediyse tabloyu okumaz.
 * Hata fırlatmaz: sorun bağlantının satırına yazılır ve ekranda görünür.
 */
export async function syncLink(linkId: Id, cfg: GoogleConfig, options: { force?: boolean } = {}): Promise<{ created: number; error: string | null }> {
  const [link] = await asService(
    (sql) => sql<LinkRow[]>`
      select l.id, l.intake_id, l.google_account_id, l.spreadsheet_id, l.sheet_id, l.sheet_title, l.last_row, l.drive_version, i.is_active
      from sheet_links l join lead_intakes i on i.id = l.intake_id where l.id = ${linkId}`,
  );
  if (!link) throw notFound("sheet link");
  // Kapalı kaynak okunmaz; açıldığında kaldığı satırdan devam eder.
  if (!link.isActive) return { created: 0, error: null };

  const note = (error: string | null) => asService((sql) => sql`update sheet_links set last_error = ${error}, last_synced_at = now() where id = ${linkId}`);
  try {
    const read = await withAccess(cfg, link.googleAccountId, async (token) => {
      const found = await fileMeta(cfg, token, link.spreadsheetId);
      if (found.trashed) throw new DataError(404, "google_file_missing", "the spreadsheet was moved to the trash");
      if (!options.force && found.version !== "" && found.version === link.driveVersion) return null;
      const [head = []] = await readRows(cfg, token, link.spreadsheetId, link.sheetTitle, 1, 1);
      return { meta: found, header: head, rows: await readRows(cfg, token, link.spreadsheetId, link.sheetTitle, link.lastRow + 1, link.lastRow + MAX_ROWS_PER_SYNC) };
    });
    if (!read) {
      await note(null);
      return { created: 0, error: null };
    }
    const { meta, header, rows } = read;

    const created = await asService(async (sql) => {
      // Aynı anda iki eşitleme çalışırsa ikincisi birincinin bitmesini bekler ve işlenmiş satırları atlar.
      const [current] = await sql<Array<{ lastRow: number }>>`select last_row from sheet_links where id = ${linkId} for update`;
      const skip = Math.max(0, current.lastRow - link.lastRow);
      let count = 0;
      let problem: string | null = null;
      for (let index = skip; index < rows.length; index++) {
        const rowNumber = link.lastRow + 1 + index;
        const values: Record<string, string> = {};
        header.slice(0, MAX_COLUMNS).forEach((name, column) => {
          const cell = rows[index][column]?.trim();
          if (name.trim() !== "" && cell) values[name.trim()] = cell;
        });
        if (Object.keys(values).length === 0) continue; // boş satır: atlanır
        try {
          const result = await sql.savepoint((inner) => receiveForIntake(inner, link.intakeId, { externalId: `${link.spreadsheetId}:${link.sheetId}:${rowNumber}`, values }));
          if (result.created) count += 1;
        } catch (error) {
          if (!(error instanceof DataError)) throw error;
          problem = `${rowNumber}: ${error.message}`;
        }
      }
      // Okunan satır sayısı sınıra dayandıysa sürüm yazılmaz: sonraki eşitleme kalanı okur.
      const more = rows.length >= MAX_ROWS_PER_SYNC;
      await sql`
        update sheet_links set last_row = ${Math.max(current.lastRow, link.lastRow + rows.length)}, drive_version = ${more ? null : meta.version || null},
          last_synced_at = now(), last_error = ${problem} where id = ${linkId}`;
      if (problem) await sql`update lead_intakes set last_error = ${problem} where id = ${link.intakeId}`;
      return count;
    });
    return { created, error: null };
  } catch (error) {
    const known = upstream(error);
    await note(known.code);
    return { created: 0, error: known.code };
  }
}

/** Yönetici ekrandan "Şimdi eşitle" dediğinde. */
export async function syncLinkNow(ws: string, linkId: Id, cfg: GoogleConfig): Promise<{ created: number; error: string | null }> {
  if (!isUuid(linkId)) throw notFound("sheet link");
  await inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const [link] = await ctx.system(() => ctx.sql`select 1 from sheet_links where id = ${linkId} and workspace_id = ${ctx.ws.id}`);
    if (!link) throw notFound("sheet link");
  });
  return syncLink(linkId, cfg, { force: true });
}

/** Google'ın değişiklik bildirimi: kanal kimliği ve gizli anahtar tutuyorsa o tablo hemen eşitlenir. */
export async function handleDriveNotification(input: { channelId: string | null; token: string | null; state: string | null }, cfg: GoogleConfig): Promise<void> {
  if (!input.channelId || !input.token) return;
  const [link] = await asService((sql) => sql<Array<{ id: Id; channelTokenHash: string | null }>>`select id, channel_token_hash from sheet_links where channel_id = ${input.channelId}`);
  // Bilinmeyen ya da eski kanal: sessizce yok sayılır (Google yeniden denemesin diye yanıt yine 200'dür).
  if (!link || link.channelTokenHash !== hash(input.token)) return;
  if (input.state === "sync") return;
  await syncLink(link.id, cfg);
}

/** Zamanlanmış iş: bütün bağlı tabloları yoklar ve süresi dolmak üzere olan bildirim kanallarını yeniler. */
export async function syncAllLinks(cfg: GoogleConfig, hook: string | null): Promise<{ links: number; created: number; renewed: number }> {
  const links = await asService(
    (sql) => sql<Array<{ id: Id; channelExpiresAt: string | null }>>`
      select l.id, l.channel_expires_at from sheet_links l join lead_intakes i on i.id = l.intake_id
      join google_accounts a on a.id = l.google_account_id where i.is_active and a.status = 'active' order by l.last_synced_at nulls first limit 200`,
  );
  let created = 0;
  let renewed = 0;
  for (const link of links) {
    created += (await syncLink(link.id, cfg)).created;
    const expiring = !link.channelExpiresAt || new Date(link.channelExpiresAt).getTime() < Date.now() + 4 * 60 * 60 * 1000;
    if (hook && expiring) {
      await startWatch(link.id, cfg, hook).then(
        () => (renewed += 1),
        () => undefined,
      );
    }
  }
  return { links: links.length, created, renewed };
}

/* ---------- ekran ---------- */

export function listSheetLinks(ws: string): Promise<SheetLink[]> {
  return inWorkspace(ws, (ctx) =>
    ctx.system(async () => [
      ...(await ctx.sql<SheetLink[]>`
        select l.id, l.intake_id, a.email, a.status as account_status, l.spreadsheet_name, l.sheet_title, l.last_synced_at, l.last_error,
          (l.channel_expires_at is not null and l.channel_expires_at > now()) as watching
        from sheet_links l join google_accounts a on a.id = l.google_account_id
        where l.workspace_id = ${ctx.ws.id} order by l.created_at, l.id`),
    ]),
  );
}
