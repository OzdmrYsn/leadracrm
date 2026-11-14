/** Hatalar kod taşır; kullanıcıya gösterilen metin istemcide katalogdan seçilir. */
export class DataError extends Error {
  constructor(
    public status: number,
    public code: string,
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

export const notFound = (what: string) => new DataError(404, "not_found", `${what} not found`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Kimlik uuid biçiminde değilse kayıt zaten yoktur: veritabanına sormadan 404. */
export function uuid(value: string, what: string): string {
  if (!isUuid(value)) throw notFound(what);
  return value;
}
