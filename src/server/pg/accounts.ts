// Hesaplar: kayıt, giriş denetimi, e-posta doğrulama, şifre sıfırlama. Kullanıcı kaydı `auth.users` tablosunda,
// şifre özeti `user_credentials` içinde durur. Tek kullanımlık belirteçlerin (doğrulama, sıfırlama) yalnız özeti saklanır.
// Bu dosyadaki sorgular kullanıcısız çalışır (oturum henüz yoktur); veritabanına sunucu bağlantısıyla girer.
import { createHash, randomBytes } from "node:crypto";
import { db, type Tx } from "../db";
import { DataError } from "../errors";
import { burnPassword, hashPassword, verifyPassword } from "../password";

export type NewAccount = { name: string; email: string; password: string; workspaceName: string };

const TURKISH: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };

const HOUR_MS = 3_600_000;
/** Doğrulama bağlantısı 24 saat, şifre sıfırlama bağlantısı 1 saat geçerlidir. */
const TOKEN_TTL_MS = { verify: 24 * HOUR_MS, reset: HOUR_MS } as const;
type TokenKind = keyof typeof TOKEN_TTL_MS;

export const tokenDigest = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

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

/** Tek kullanımlık belirteç üretir; aynı türdeki eski belirteçler geçersiz olur. Dönen değer yalnız e-postaya yazılır. */
async function issueToken(sql: Tx, userId: string, kind: TokenKind): Promise<string> {
  const token = newToken();
  await sql`delete from auth_tokens where user_id = ${userId} and kind = ${kind}`;
  await sql`
    insert into auth_tokens (user_id, kind, token_hash, expires_at)
    values (${userId}, ${kind}, ${tokenDigest(token)}, ${new Date(Date.now() + TOKEN_TTL_MS[kind]).toISOString()})`;
  return token;
}

/** Belirteci kullanır: geçerliyse sahibini döndürür ve bir daha kullanılamaz hale getirir. */
async function consumeToken(sql: Tx, token: string, kind: TokenKind): Promise<string | null> {
  const [row] = await sql<Array<{ userId: string }>>`
    update auth_tokens set used_at = now()
    where token_hash = ${tokenDigest(token)} and kind = ${kind} and used_at is null and expires_at > now()
    returning user_id`;
  return row?.userId ?? null;
}

/** Kullanıcı kaydını ve şifre özetini yazar. E-posta kayıtlıysa 409. Çağıran işlem içinde çalışır. */
export async function insertUser(sql: Tx, input: { name: string; email: string; password: string; verified: boolean }): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const [taken] = await sql`select 1 from auth.users where lower(email) = ${email}`;
  if (taken) throw new DataError(409, "email_taken", "an account with this email already exists");
  const [user] = await sql<Array<{ id: string }>>`
    insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ full_name: input.name.trim() })}) returning id`;
  await sql`update profiles set lang = 'tr', timezone = 'Europe/Istanbul' where id = ${user.id}`;
  await sql`
    insert into user_credentials (user_id, password_hash, email_verified_at)
    values (${user.id}, ${await hashPassword(input.password)}, ${input.verified ? sql`now()` : null})`;
  return user.id;
}

/**
 * Kullanıcıyı ve ilk çalışma alanını tek işlemde kurar: yönetici üyelik, ana pipeline, aşamalar, görev türleri,
 * kayıp nedenleri, deneme aboneliği. Dönen doğrulama belirteci e-postayla gönderilir.
 */
export async function createAccount(input: NewAccount): Promise<{ userId: string; slug: string; email: string; verifyToken: string }> {
  const result = await db().begin(async (sql) => {
    const userId = await insertUser(sql, { name: input.name, email: input.email, password: input.password, verified: false });
    const slug = await freeSlug(sql, input.workspaceName);
    // app.create_workspace kimin için kurduğunu auth.uid() ile öğrenir.
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    await sql`select set_config('request.jwt.claim.sub', ${userId}, true), set_config('request.jwt.claims', ${claims}, true)`;
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
    return { userId, slug, email: input.email.trim().toLowerCase(), verifyToken: await issueToken(sql, userId, "verify") };
  });
  return result as { userId: string; slug: string; email: string; verifyToken: string };
}

/**
 * E-posta ve şifreyi denetler; tutuyorsa kullanıcıyı ve gireceği çalışma alanını (en eski etkin üyeliği) döndürür.
 * Kayıtlı olmayan e-postada da şifre özeti hesaplanır: yanıt süresi hangi adresin kayıtlı olduğunu ele vermesin.
 */
export async function checkLogin(emailInput: string, password: string): Promise<{ userId: string; slug: string | null } | null> {
  const email = emailInput.trim().toLowerCase();
  const [row] = await db()<Array<{ userId: string; passwordHash: string | null; slug: string | null }>>`
    select u.id as user_id, c.password_hash, (
      select w.slug from workspace_members m join workspaces w on w.id = m.workspace_id
      where m.user_id = u.id and m.is_active order by m.created_at, w.slug limit 1
    ) as slug
    from auth.users u left join user_credentials c on c.user_id = u.id
    where lower(u.email) = ${email} limit 1`;
  if (!row?.passwordHash) {
    await burnPassword(password);
    return null;
  }
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  return { userId: row.userId, slug: row.slug };
}

/** Oturumdaki kullanıcının hesap durumu. Şifre kaydı olmayan kullanıcı (yalnız örnek veride olabilir) doğrulanmış sayılır. */
export async function accountStatus(userId: string): Promise<{ email: string; name: string; emailVerified: boolean }> {
  const [row] = await db()<Array<{ email: string; name: string; hasPassword: boolean; verified: boolean }>>`
    select p.email, p.full_name as name, c.user_id is not null as has_password, c.email_verified_at is not null as verified
    from profiles p left join user_credentials c on c.user_id = p.id where p.id = ${userId}`;
  if (!row) throw new DataError(401, "unauthenticated");
  return { email: row.email, name: row.name, emailVerified: !row.hasPassword || row.verified };
}

/** Doğrulama bağlantısındaki belirteci kullanır. */
export async function verifyEmail(token: string): Promise<boolean> {
  const done = await db().begin(async (sql) => {
    const userId = await consumeToken(sql, token, "verify");
    if (!userId) return false;
    await sql`update user_credentials set email_verified_at = coalesce(email_verified_at, now()) where user_id = ${userId}`;
    return true;
  });
  return Boolean(done);
}

/** Doğrulanmamış hesap için yeni doğrulama belirteci; hesap doğrulanmışsa null. */
export async function reissueVerification(userId: string): Promise<{ token: string; email: string; name: string } | null> {
  const result = await db().begin(async (sql) => {
    const [row] = await sql<Array<{ email: string; name: string }>>`
      select p.email, p.full_name as name from profiles p join user_credentials c on c.user_id = p.id
      where p.id = ${userId} and c.email_verified_at is null`;
    if (!row) return null;
    return { token: await issueToken(sql, userId, "verify"), email: row.email, name: row.name };
  });
  return result as { token: string; email: string; name: string } | null;
}

/** Şifre sıfırlama belirteci; e-posta kayıtlı değilse null (çağıran her iki durumda aynı yanıtı verir). */
export async function requestPasswordReset(emailInput: string): Promise<{ token: string; email: string; name: string } | null> {
  const email = emailInput.trim().toLowerCase();
  const result = await db().begin(async (sql) => {
    const [row] = await sql<Array<{ id: string; email: string; name: string }>>`
      select p.id, p.email, p.full_name as name from profiles p join user_credentials c on c.user_id = p.id where lower(p.email) = ${email}`;
    if (!row) return null;
    return { token: await issueToken(sql, row.id, "reset"), email: row.email, name: row.name };
  });
  return result as { token: string; email: string; name: string } | null;
}

/**
 * Bağlantıdaki belirteçle yeni şifre belirler. Bütün oturumlar kapanır. Bağlantı e-postaya gittiği için adres de
 * doğrulanmış sayılır. Belirteç geçersiz ya da süresi dolmuşsa false.
 */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const hash = await hashPassword(password);
  const done = await db().begin(async (sql) => {
    const userId = await consumeToken(sql, token, "reset");
    if (!userId) return false;
    await sql`
      update user_credentials set password_hash = ${hash}, email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
      where user_id = ${userId}`;
    await sql`delete from user_sessions where user_id = ${userId}`;
    return true;
  });
  return Boolean(done);
}
