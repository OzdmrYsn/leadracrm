/**
 * Büyük/küçük harf duyarsız karşılaştırma anahtarı.
 * Türkçede "I" ile "ı", "İ" ile "i" eşleşir; düz toLowerCase ya da yerel ayarlı sürümü tek başına
 * "VIP" ile "vip"i ya da "İstanbul" ile "istanbul"u eşleştiremez. Burada dört harf de "i" sayılır.
 * Arama ve tekillik denetimlerinde iki taraf da bu işlevden geçirilir.
 */
export function fold(text: string): string {
  return text.normalize("NFKC").replace(/[İIı]/g, "i").toLowerCase().trim();
}
