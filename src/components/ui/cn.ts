/** Sınıf adlarını birleştirir; boş ve yanlış değerleri atar. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
