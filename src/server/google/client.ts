// Google'ın resmî uçlarına yapılan çağrılar: OAuth, Drive (dosya bilgisi, değişiklik bildirimi) ve Sheets (satır okuma).
// SDK kullanılmaz; her çağrı süre sınırlı bir fetch'tir.
import type { GoogleConfig } from "./config";

export class GoogleError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`google: ${status} ${reason}`);
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new GoogleError(504, "unreachable");
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // JSON olmayan gövde: aşağıda durum koduyla değerlendirilir.
  }
  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    const reason = typeof error === "string" ? error : ((error as { status?: string; message?: string } | undefined)?.status ?? "error");
    throw new GoogleError(response.status, reason);
  }
  return body as T;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const form = (values: Record<string, string>) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values).toString() });

export async function exchangeCode(cfg: GoogleConfig, code: string, redirectUri: string) {
  const body = await call<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(
    cfg.tokenUrl,
    form({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  );
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, expiresIn: body.expires_in, scope: body.scope ?? "" };
}

/** Erişim iptal edilmişse ya da süresi dolmuşsa Google "invalid_grant" döner: kullanıcı yeniden bağlanmalıdır. */
export async function refreshAccess(cfg: GoogleConfig, refreshToken: string) {
  const body = await call<{ access_token: string; expires_in: number }>(
    cfg.tokenUrl,
    form({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  );
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

export async function userInfo(cfg: GoogleConfig, accessToken: string) {
  const body = await call<{ sub: string; email?: string }>(cfg.userinfoUrl, { headers: bearer(accessToken) });
  return { sub: body.sub, email: body.email ?? "" };
}

export async function fileMeta(cfg: GoogleConfig, accessToken: string, fileId: string) {
  const body = await call<{ name: string; version?: string; trashed?: boolean }>(`${cfg.driveBase}/files/${encodeURIComponent(fileId)}?fields=name,version,trashed`, {
    headers: bearer(accessToken),
  });
  return { name: body.name, version: body.version ?? "", trashed: body.trashed === true };
}

export async function listTabs(cfg: GoogleConfig, accessToken: string, spreadsheetId: string) {
  const body = await call<{ sheets?: Array<{ properties: { sheetId: number; title: string; hidden?: boolean } }> }>(
    `${cfg.sheetsBase}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent("sheets.properties(sheetId,title,index,hidden)")}`,
    { headers: bearer(accessToken) },
  );
  return (body.sheets ?? []).filter((sheet) => !sheet.properties.hidden).map((sheet) => ({ sheetId: sheet.properties.sheetId, title: sheet.properties.title }));
}

/** A1 gösterimi: sayfa adı tek tırnak içine alınır, addaki tek tırnak ikilenir. */
export function a1(title: string, fromRow: number, toRow?: number): string {
  return `'${title.replace(/'/g, "''")}'!A${fromRow}:ZZ${toRow ?? ""}`;
}

/** Satırları görünen değerleriyle okur. Sondaki boş satır ve hücreler gelmez; aradaki boş satır boş dizi olur. */
export async function readRows(cfg: GoogleConfig, accessToken: string, spreadsheetId: string, title: string, fromRow: number, toRow?: number): Promise<string[][]> {
  const body = await call<{ values?: unknown[][] }>(
    `${cfg.sheetsBase}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(a1(title, fromRow, toRow))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: bearer(accessToken) },
  );
  return (body.values ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))));
}

export async function watchFile(cfg: GoogleConfig, accessToken: string, fileId: string, channel: { id: string; address: string; token: string; expiration: number }) {
  const body = await call<{ resourceId: string; expiration?: string }>(`${cfg.driveBase}/files/${encodeURIComponent(fileId)}/watch`, {
    method: "POST",
    headers: { ...bearer(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ id: channel.id, type: "web_hook", address: channel.address, token: channel.token, expiration: String(channel.expiration) }),
  });
  return { resourceId: body.resourceId, expiration: Number(body.expiration ?? channel.expiration) };
}

export async function stopChannel(cfg: GoogleConfig, accessToken: string, channel: { id: string; resourceId: string }): Promise<void> {
  await call<unknown>(`${cfg.driveBase}/channels/stop`, {
    method: "POST",
    headers: { ...bearer(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(channel),
  });
}
