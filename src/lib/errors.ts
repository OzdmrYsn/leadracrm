import type { Messages } from "@/i18n/tr";
import { ApiError } from "./api";

/** API hata kodunu kullanıcıya gösterilecek metne çevirir. Tanınmayan kod genel iletiye düşer. */
export function errorText(error: unknown, t: Messages): string {
  if (error instanceof ApiError) {
    const known = t.errors as Record<string, string>;
    return known[error.code] ?? t.errors.unknown;
  }
  return t.errors.unknown;
}
