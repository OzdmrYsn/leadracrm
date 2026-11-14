// Basit hız sınırı: anahtar başına, kayan pencere. Sayaçlar bu sürecin belleğinde durur.
// Tek sunuculu kurulumda yeterlidir; birden çok sunucuda (ya da sunucusuz ortamda) her kopya kendi sayacını tutar,
// yani sınır kopya sayısı kadar gevşer. Yayın adımında paylaşılan bir sayaçla (veritabanı ya da Redis) değiştirilecek.
const globalHits = globalThis as typeof globalThis & { __yscHits?: Map<string, number[]> };

/** İstek sınırın içindeyse true döner ve isteği sayar. */
export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const hits = (globalHits.__yscHits ??= new Map<string, number[]>());
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Bellek büyümesin: ara sıra eski anahtarları at.
  if (hits.size > 5000) {
    for (const [name, times] of hits) if (times.every((time) => now - time >= windowMs)) hits.delete(name);
  }
  return true;
}

/** Sayaçları sıfırlar. Yalnız geliştirmedeki veri sıfırlama ucu çağırır; testler birbirinin sınırına takılmasın. */
export function resetRateLimits(): void {
  globalHits.__yscHits?.clear();
}
