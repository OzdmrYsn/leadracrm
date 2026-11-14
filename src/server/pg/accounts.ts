// Hesap açma ve oturum bulma. Şimdilik yalnız geliştirme sağlayıcısı kullanır: kullanıcı yerel auth şemasına yazılır
// ve şifre doğrulanmaz. Supabase Auth bağlandığında kullanıcıyı Auth oluşturur; çalışma alanı kurulumu
// (app.create_workspace ve Türkçe adlar) aynı kalır.
import { db, type Tx } from "../db";
import { DataError } from "../errors";

export type NewAccount = { name: string; email: string; workspaceName: string };

const TURKISH: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };

/** Çalışma alanı adından adres parçası üretir: küçük harf, rakam ve tire; 3-32 karakter. */
export function slugify(name: string): string {
  const ascii = Array.from(name, (char) => TURKISH[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return ascii.length >= 3 ? ascii : `${ascii || "alan"}-crm`.slice(0, 32);
}

async function freeSlug(sql: Tx, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 1; attempt <= 50; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const [taken] = await sql`select 1 from workspaces where slug = ${slug}`;
    if (!taken) return slug;
  }
  throw new DataError(409, "conflict", "could not find a free workspace address");
}

/** Kullanıcıyı ve ilk çalışma alanını tek işlemde kurar: yönetici üyelik, ana pipeline, aşamalar, görev türleri, kayıp nedenleri. */
export async function createAccount(input: NewAccount): Promise<{ userId: string; slug: string }> {
  const email = input.email.trim().toLowerCase();
  const result = await db().begin(async (sql) => {
    const [taken] = await sql`select 1 from auth.users where lower(email) = ${email}`;
    if (taken) throw new DataError(409, "email_taken", "an account with this email already exists");
    const [user] = await sql<Array<{ id: string }>>`
      insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ full_name: input.name.trim() })}) returning id`;
    await sql`update profiles set lang = 'tr', timezone = 'Europe/Istanbul' where id = ${user.id}`;

    const slug = await freeSlug(sql, input.workspaceName);
    // app.create_workspace kimin için kurduğunu auth.uid() ile öğrenir.
    const claims = JSON.stringify({ sub: user.id, role: "authenticated" });
    await sql`select set_config('request.jwt.claim.sub', ${user.id}, true), set_config('request.jwt.claims', ${claims}, true)`;
    const [created] = await sql<Array<{ id: string }>>`
      select app.create_workspace(${input.workspaceName.trim()}, ${slug}, ${["İlk temas", "Görüşme", "Teklif"]}::text[], ${["Takip", "Toplantı"]}::text[]) as id`;
    const ws = created.id;
    await sql`update workspaces set language = 'tr', country = 'TR', currency = 'TRY', timezone = 'Europe/Istanbul' where id = ${ws}`;
    await sql`update pipelines set name = 'Satış' where workspace_id = ${ws}`;
    await sql`
      update stages set name = case kind when 'incoming' then 'Gelen talepler' when 'won' then 'Kazanıldı' else 'Kaybedildi' end
      where workspace_id = ${ws} and kind in ('incoming', 'won', 'lost')`;
    await sql`update sources set name = 'Elle' where workspace_id = ${ws} and kind = 'manual'`;
    await sql`
      insert into loss_reasons (workspace_id, name, sort) values
        (${ws}, 'Fiyat yüksek geldi', 10), (${ws}, 'Başka firmayı seçti', 20), (${ws}, 'Yanıt vermedi', 30), (${ws}, 'İhtiyaç kalmadı', 40)`;
    return { userId: user.id, slug };
  });
  return result as { userId: string; slug: string };
}

/** E-postaya bağlı kullanıcıyı ve gireceği çalışma alanını bulur (en eski etkin üyeliği). */
export async function findLogin(emailInput: string): Promise<{ userId: string; slug: string | null } | null> {
  const email = emailInput.trim().toLowerCase();
  const rows = await db()<Array<{ userId: string; slug: string | null }>>`
    select u.id as user_id, (
      select w.slug from workspace_members m join workspaces w on w.id = m.workspace_id
      where m.user_id = u.id and m.is_active order by m.created_at, w.slug limit 1
    ) as slug
    from auth.users u where lower(u.email) = ${email} limit 1`;
  return rows[0] ?? null;
}
