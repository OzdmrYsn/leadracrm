/**
 * İşleri sırayla çalıştırır. Biri sürerken gelen iş bekler; beklerken bir yenisi gelirse eskisinin yerini alır.
 *
 * Neden: art arda yapılan iki kayıt (iki sıralama, iki işaretleme) ayrı isteklerle gider ve sunucuda eşzamanlı
 * işlenir; hangisinin son yazacağı belli olmaz, eski değer kazanabilir. Her iş güncel durumun tamamını taşıdığı
 * için aradakileri atlamak güvenlidir: son gönderilen, kullanıcının son gördüğüdür.
 */
export function createSerial() {
  let running = false;
  let waiting: (() => Promise<unknown>) | null = null;
  let whenIdle: (() => void) | null = null;

  async function pump(first: () => Promise<unknown>) {
    running = true;
    let job: (() => Promise<unknown>) | null = first;
    while (job) {
      await job().catch(() => undefined);
      job = waiting;
      waiting = null;
    }
    running = false;
    whenIdle?.();
  }

  return {
    /** job kendi hatasını kendisi ele alır. onIdle, bekleyen iş kalmadığında çağrılır. */
    run(job: () => Promise<unknown>, onIdle: () => void) {
      whenIdle = onIdle;
      if (running) waiting = job;
      else void pump(job);
    },
  };
}
