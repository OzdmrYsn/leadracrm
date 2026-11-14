// Postgres bağlantısı. Uygulama veritabanına iki rolle girer:
//   asUser    → "authenticated" rolü ve kullanıcının kimliğiyle; satır düzeyi güvenlik (RLS) uygulanır.
//   asService → "service_role" ile; RLS'i aşar. Yalnız kanal webhook'u ve arka plan işleri gibi
//               kullanıcısı olmayan yerlerde kullanılır.
// Her çağrı tek bir işlemdir (transaction): içinde bir adım başarısız olursa hiçbiri yazılmaz.
import postgres from "postgres";

const options = {
  max: 10,
  // Supabase'in işlem kipindeki bağlantı havuzu hazırlanmış ifadeleri desteklemez.
  prepare: false,
  onnotice: () => undefined,
  // Sütunlar veritabanında snake_case, kodda camelCase.
  transform: { column: { from: postgres.toCamel, to: postgres.fromCamel } },
  types: {
    // Zamanlar ISO dizgisi olarak okunur (API de öyle döner); bigint sayıya çevrilir (kuruş cinsinden tutarlar).
    timestamptz: {
      to: 1184,
      from: [1184],
      serialize: (value: string | Date) => (value instanceof Date ? value.toISOString() : value),
      parse: (value: string) => new Date(value).toISOString(),
    },
    bigint: { to: 20, from: [20], serialize: (value: number) => String(value), parse: (value: string) => Number(value) },
  },
};

function connect(url: string) {
  return postgres(url, options);
}

type Db = ReturnType<typeof connect>;
export type Tx = Parameters<Parameters<Db["begin"]>[1]>[0];
/** Başka bir sorgunun içine yerleştirilen SQL parçası (ör. "and l.stage_id = ..."). */
export type Fragment = postgres.PendingQuery<postgres.Row[]>;

// Next.js geliştirmede modülleri yeniden yükler; bağlantı havuzu globalThis üzerinde tutulur ki çoğalmasın.
const globalDb = globalThis as typeof globalThis & { __yscDb?: Db };

export function db(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil. .env.example dosyasına bakın.");
  globalDb.__yscDb ??= connect(url);
  return globalDb.__yscDb;
}

/** Kullanıcının kimliğiyle çalışır: auth.uid() bu kullanıcıyı döndürür ve RLS uygulanır. */
export async function asUser<T>(userId: string, work: (sql: Tx) => Promise<T>): Promise<T> {
  const result = await db().begin(async (sql) => {
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await sql`select set_config('request.jwt.claim.sub', ${userId}, true), set_config('request.jwt.claims', ${claims}, true)`;
    await sql`set local role authenticated`;
    return work(sql);
  });
  return result as T;
}

/** Sunucu rolüyle çalışır; RLS uygulanmaz. Kullanıcı isteğinden gelen veriyle dikkatli kullanın. */
export async function asService<T>(work: (sql: Tx) => Promise<T>): Promise<T> {
  const result = await db().begin(async (sql) => {
    await sql`set local role service_role`;
    return work(sql);
  });
  return result as T;
}
