// Mesajlaşma kanalları: bağlama, bağlantıyı kesme, gelen bildirimi işleme ve mesaj gönderme.
// Kanal anahtarı çalışma alanı yöneticisinindir; veritabanında uygulama sırrıyla şifreli durur ve istemciye hiç dönmez.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Channel, ChannelKind, Id } from "@/lib/types";
import { isProduction } from "../auth";
import { adapterFor, ChannelError } from "../channels";
import { asService } from "../db";
import { DataError, isUuid, notFound } from "../errors";
import { seal, unseal } from "../secret-box";
import { ingestMessage } from "./chat";
import { inWorkspace, requireAdmin } from "./ctx";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function sameDigest(a: string, b: string): boolean {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Adaptör hatasını API hatasına çevirir. Hizmetin kendi açıklaması yalnız geliştirici iletisine gider. */
function connectError(error: unknown): never {
  if (error instanceof ChannelError) {
    if (error.code === "invalid_credentials") throw new DataError(422, "channel_invalid_token", error.message);
    if (error.code === "needs_public_url") throw new DataError(422, "channel_needs_public_url", error.message);
    throw new DataError(502, "channel_unreachable", error.message);
  }
  throw error;
}

/** Bağlı kanallar (örnek verinin kanalları ve bağlantısı kesilmiş olanlar hariç). Anahtar dönmez. */
export function listChannels(ws: string): Promise<Channel[]> {
  return inWorkspace(ws, async (ctx) => {
    const rows = await ctx.sql<Channel[]>`
      select id, kind, name, status, pipeline_id, last_error, last_event_at, connected_at
      from channels
      where workspace_id = ${ctx.ws.id} and not is_demo and status <> 'disconnected'
      order by connected_at nulls last, created_at`;
    return rows.map((row) => ({ ...row }));
  });
}

/**
 * Kanalı bağlar: anahtar hizmete sorularak doğrulanır, hesap başka bir çalışma alanına bağlı değilse bildirim adresi
 * kurulur ve anahtar şifrelenip saklanır. Aynı hesap bu çalışma alanında daha önce bağlandıysa o kayıt yeniden açılır;
 * eski konuşmalar yerinde kalır.
 */
export async function connectChannel(ws: string, input: { kind: ChannelKind; credentials: Record<string, string>; pipelineId?: Id }, origin: string): Promise<Channel> {
  const adapter = adapterFor(input.kind);
  if (!adapter) throw new DataError(422, "channel_unsupported");

  // 1. Yetki ve hedef pipeline (ağ çağrısından önce, kısa bir işlemde).
  const target = await inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (input.pipelineId !== undefined) {
      if (!isUuid(input.pipelineId)) throw notFound("pipeline");
      const [pipeline] = await ctx.sql`select 1 from pipelines where id = ${input.pipelineId} and workspace_id = ${ctx.ws.id} and archived_at is null`;
      if (!pipeline) throw notFound("pipeline");
    }
    return { workspaceId: ctx.ws.id, userId: ctx.user.id };
  });

  // 2. Hesabı tanı (ağ).
  const account = await adapter.identify(input.credentials, origin).catch(connectError);

  // 3. Aynı hesap başka yerde bağlı mı, burada eski bir kaydı var mı?
  const existing = await asService(async (sql) => {
    const rows = await sql<Array<{ id: Id; workspaceId: Id; status: string }>>`
      select id, workspace_id, status from channels
      where kind = ${input.kind} and external_account_id = ${account.externalAccountId} and not is_demo`;
    if (rows.some((row) => row.workspaceId !== target.workspaceId && row.status !== "disconnected")) throw new DataError(409, "channel_in_use");
    return rows.find((row) => row.workspaceId === target.workspaceId) ?? null;
  });

  // 4. Bildirim adresini kur (ağ). Adres kanalın kimliğini taşır; gizli değer yalnız özeti saklanarak tutulur.
  const id = existing?.id ?? randomUUID();
  const secret = randomBytes(32).toString("base64url");
  await adapter.subscribe(account.credentials, { webhookUrl: `${origin}/api/hooks/${input.kind}/${id}`, secret, origin }).catch(connectError);

  // 5. Kaydı yaz.
  return asService(async (sql) => {
    const sealed = seal(JSON.stringify(account.credentials));
    const [row] = await sql<Channel[]>`
      insert into channels (id, workspace_id, kind, name, external_account_id, status, credentials_sealed, webhook_token_hash,
                            pipeline_id, last_error, connected_at, created_by)
      values (${id}, ${target.workspaceId}, ${input.kind}, ${account.name}, ${account.externalAccountId}, 'connected', ${sealed}, ${digest(secret)},
              ${input.pipelineId ?? null}, null, now(), ${target.userId})
      on conflict (id) do update set
        name = excluded.name, status = 'connected', credentials_sealed = excluded.credentials_sealed,
        webhook_token_hash = excluded.webhook_token_hash, pipeline_id = coalesce(excluded.pipeline_id, channels.pipeline_id),
        last_error = null, connected_at = now()
      returning id, kind, name, status, pipeline_id, last_error, last_event_at, connected_at`;
    return { ...row };
  });
}

/** Bağlantıyı keser: hizmetteki bildirim adresi kaldırılır, anahtar silinir. Konuşma geçmişi yerinde kalır. */
export async function disconnectChannel(ws: string, channelId: Id, origin: string): Promise<void> {
  const channel = await inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(channelId)) throw notFound("channel");
    const [row] = await ctx.sql<Array<{ id: Id; kind: ChannelKind }>>`
      select id, kind from channels where id = ${channelId} and workspace_id = ${ctx.ws.id} and not is_demo and status <> 'disconnected'`;
    if (!row) throw notFound("channel");
    return row;
  });
  const sealed = await asService(async (sql) => {
    const [row] = await sql<Array<{ credentialsSealed: string | null }>>`select credentials_sealed from channels where id = ${channel.id}`;
    return row?.credentialsSealed ?? null;
  });
  // Hizmete ulaşılamasa da bağlantı bizim tarafta kesilir; anahtar silindiği için bildirimler artık kabul edilmez.
  if (sealed) await adapterFor(channel.kind)?.disconnect(JSON.parse(unseal(sealed)) as Record<string, string>, origin).catch(() => undefined);
  await asService((sql) => sql`
    update channels set status = 'disconnected', credentials_sealed = null, webhook_token_hash = null, last_error = null where id = ${channel.id}`);
}

/**
 * Kanaldan gelen bildirimi işler. Gizli değer tutmuyorsa 401. Aynı olay ikinci kez gelirse yeniden işlenmez.
 * Hepsi tek işlemdir: bir adım başarısız olursa hiçbir şey yazılmaz ve hizmet bildirimi yeniden gönderir.
 */
export function receiveChannelWebhook(kind: ChannelKind, channelId: string, secret: string | null, body: unknown): Promise<{ accepted: number }> {
  const adapter = adapterFor(kind);
  if (!adapter || !isUuid(channelId)) throw notFound("channel");
  return asService(async (sql) => {
    const [channel] = await sql<Array<{ id: Id; workspaceId: Id; kind: ChannelKind; pipelineId: Id | null; webhookTokenHash: string | null; currency: string }>>`
      select ch.id, ch.workspace_id, ch.kind, ch.pipeline_id, ch.webhook_token_hash, w.currency
      from channels ch join workspaces w on w.id = ch.workspace_id
      where ch.id = ${channelId} and ch.kind = ${kind} and not ch.is_demo and ch.status in ('connected', 'error')`;
    if (!channel?.webhookTokenHash) throw notFound("channel");
    if (!secret || !sameDigest(digest(secret), channel.webhookTokenHash)) throw new DataError(401, "unauthorized");

    let accepted = 0;
    for (const event of adapter.parse(body)) {
      const [fresh] = await sql<Array<{ id: Id }>>`
        insert into webhook_inbox (provider, channel_id, external_event_id, payload)
        values (${kind}, ${channel.id}, ${event.eventId}, ${sql.json(JSON.parse(JSON.stringify(body)))})
        on conflict (provider, channel_id, external_event_id) do nothing
        returning id`;
      if (!fresh) continue;
      if (event.type === "message") {
        await ingestMessage(sql, { id: channel.workspaceId, currency: channel.currency }, channel, {
          externalChatId: event.chatId,
          contactName: event.contactName,
          text: event.text,
          externalMessageId: event.externalMessageId,
        });
      } else {
        await sql`
          update messages set status = ${event.status}, error_code = ${event.errorCode ?? null},
            delivered_at = case when ${event.status} in ('delivered', 'read') then coalesce(delivered_at, now()) else delivered_at end,
            read_at = case when ${event.status} = 'read' then coalesce(read_at, now()) else read_at end
          where workspace_id = ${channel.workspaceId} and external_message_id = ${event.externalMessageId} and direction = 'out'
            and conversation_id in (select id from conversations where channel_id = ${channel.id})`;
      }
      await sql`update webhook_inbox set processed_at = now(), attempts = attempts + 1 where id = ${fresh.id}`;
      accepted += 1;
    }
    // Bildirim geldiyse kanal ayaktadır.
    await sql`update channels set last_event_at = now(), status = 'connected', last_error = null where id = ${channel.id}`;
    return { accepted };
  });
}

/**
 * Kuyruktaki mesajı kanala gönderir. Ağ çağrısı veritabanı işleminin dışındadır: önce okunur, sonra gönderilir,
 * sonuç ayrı bir işlemde yazılır. Hata mesajın üstünde kalır ve "yeniden dene" ile tekrar gönderilebilir.
 */
export async function deliverMessage(messageId: Id, origin: string): Promise<void> {
  const job = await asService(async (sql) => {
    const [row] = await sql<
      Array<{ id: Id; body: string | null; chatId: string; channelId: Id; kind: ChannelKind; channelStatus: string; credentialsSealed: string | null; isDemo: boolean }>
    >`
      select m.id, m.body, c.external_chat_id as chat_id, ch.id as channel_id, ch.kind, ch.status as channel_status, ch.credentials_sealed, ch.is_demo
      from messages m
      join conversations c on c.id = m.conversation_id
      join channels ch on ch.id = c.channel_id
      where m.id = ${messageId} and m.direction = 'out' and m.status = 'queued'`;
    return row ?? null;
  });
  if (!job) return;

  const fail = (code: string) =>
    asService(async (sql) => {
      await sql`update messages set status = 'failed', error_code = ${code}, error_text = null where id = ${job.id}`;
      if (code === "unauthorized") await sql`update channels set status = 'error', last_error = 'unauthorized' where id = ${job.channelId}`;
    });
  const sent = (externalMessageId: string | null) =>
    asService((sql) => sql`
      update messages set status = 'sent', sent_at = now(), external_message_id = ${externalMessageId}, error_code = null, error_text = null where id = ${job.id}`);

  // Örnek verinin kanalı: anahtarı yoktur. Geliştirmede mesaj gönderilmiş sayılır; üretimde böyle bir kanal olamaz.
  if (job.isDemo) return void (isProduction() ? await fail("channel_disconnected") : await sent(null));
  const adapter = adapterFor(job.kind);
  if (!adapter || !job.credentialsSealed || job.channelStatus === "disconnected") return void (await fail("channel_disconnected"));

  try {
    const result = await adapter.send(JSON.parse(unseal(job.credentialsSealed)) as Record<string, string>, job.chatId, job.body ?? "", origin);
    await sent(result.externalMessageId);
  } catch (error) {
    await fail(error instanceof ChannelError ? error.code : "unreachable");
  }
}
