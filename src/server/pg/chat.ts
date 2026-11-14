// Konuşmalar, mesajlar, notlar ve kanaldan gelen mesajın işlenmesi.
import type { Conversation, Id, Message, Note } from "@/lib/types";
import { asService } from "../db";
import { isUuid, notFound } from "../errors";
import { fireAutomations } from "./automations";
import { checkUser, handoff, inWorkspace, type Ctx } from "./ctx";
import { conversations, messages } from "./shared";

async function findConversation(ctx: Ctx, conversationId: Id): Promise<Conversation> {
  if (!isUuid(conversationId)) throw notFound("conversation");
  const [conversation] = await conversations(ctx, ctx.sql`and c.id = ${conversationId}`);
  if (!conversation) throw notFound("conversation");
  return conversation;
}

export function listConversations(ws: string, filter: { status?: "open" | "all"; query?: string } = {}): Promise<Conversation[]> {
  return inWorkspace(ws, (ctx) => {
    const { sql } = ctx;
    const status = filter.status === "all" ? sql`` : sql`and c.status = 'open'`;
    const query = filter.query?.trim()
      ? sql`and position(app.fold(${filter.query}) in app.fold(concat_ws(' ', ct.name, c.last_message_preview))) > 0`
      : sql``;
    return conversations(ctx, sql`${status} ${query}`);
  });
}

export function listMessages(ws: string, conversationId: Id): Promise<Message[]> {
  return inWorkspace(ws, async (ctx) => {
    const conversation = await findConversation(ctx, conversationId);
    return messages(ctx, ctx.sql`and m.conversation_id = ${conversation.id}`);
  });
}

export function markConversationRead(ws: string, conversationId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    const conversation = await findConversation(ctx, conversationId);
    await ctx.sql`update conversations set unread_count = 0 where id = ${conversation.id}`;
  });
}

/** Konuşmayı bir ekip üyesine atar; null atamayı kaldırır. Konuşmanın grubu veritabanında atanana göre güncellenir. */
export function assignConversation(ws: string, conversationId: Id, userId: Id | null): Promise<Conversation> {
  return inWorkspace(ws, async (ctx) => {
    const conversation = await findConversation(ctx, conversationId);
    const assignee = await checkUser(ctx, userId);
    await handoff(ctx, assignee, () => ctx.sql`update conversations set assigned_user_id = ${assignee} where id = ${conversation.id}`);
    // Atama, kısıtlı kapsamlı kullanıcının konuşmayı artık görememesine yol açabilir; sonucu yine de döndür.
    return ctx.system(async () => (await conversations(ctx, ctx.sql`and c.id = ${conversation.id}`))[0]);
  });
}

/** Konuşmayı kapatır ya da yeniden açar. Kapalı konuşma varsayılan gelen kutusu görünümünden çıkar; müşteri yeniden yazarsa açılır. */
export function setConversationStatus(ws: string, conversationId: Id, status: "open" | "closed"): Promise<Conversation> {
  return inWorkspace(ws, async (ctx) => {
    const conversation = await findConversation(ctx, conversationId);
    await ctx.sql`
      update conversations set status = ${status}, closed_at = ${status === "closed" ? ctx.sql`now()` : null}, unread_count = ${status === "closed" ? 0 : ctx.sql`unread_count`}
      where id = ${conversation.id}`;
    return findConversation(ctx, conversation.id);
  });
}

/**
 * Mesajı kuyruğa alır. Aynı client_token ikinci kez gelirse (çift tıklama, ağ yeniden denemesi)
 * ilk mesaj döner; ikinci mesaj yazılmaz. Tekilliği veritabanı zorlar.
 */
export function sendMessage(ws: string, conversationId: Id, input: { clientToken: string; body: string }): Promise<Message> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    const conversation = await findConversation(ctx, conversationId);
    const inserted = await sql<Array<{ id: Id }>>`
      insert into messages (workspace_id, conversation_id, direction, sender_kind, sender_user_id, body, client_token, status)
      values (${ctx.ws.id}, ${conversation.id}, 'out', 'user', ${user.id}, ${input.body}, ${input.clientToken}, 'queued')
      on conflict (workspace_id, client_token) where client_token is not null do nothing
      returning id`;
    if (inserted.length > 0) {
      await sql`update conversations set assigned_user_id = ${user.id} where id = ${conversation.id} and assigned_user_id is null`;
      await deliver(ctx, inserted[0].id);
    }
    const [message] = await messages(ctx, sql`and m.client_token = ${input.clientToken}`);
    return message;
  });
}

/**
 * Kanal adaptörünün yeri. Gerçek kanal bağlanana kadar mesaj hemen "gönderildi" sayılır;
 * Telegram ve WhatsApp adaptörleri geldiğinde bu adım message/send işine taşınır.
 */
async function deliver(ctx: Ctx, messageId: Id): Promise<void> {
  await ctx.system(() => ctx.sql`update messages set status = 'sent', sent_at = now() where id = ${messageId}`);
}

export function addNote(ws: string, leadId: Id, body: string): Promise<Note> {
  return inWorkspace(ws, async (ctx) => {
    const { sql, user } = ctx;
    if (!isUuid(leadId)) throw notFound("lead");
    const [lead] = await sql<Array<{ id: Id }>>`select id from leads where id = ${leadId} and workspace_id = ${ctx.ws.id} and deleted_at is null`;
    if (!lead) throw notFound("lead");
    const [note] = await sql<Array<{ id: Id; createdAt: string }>>`
      insert into notes (workspace_id, lead_id, body, created_by) values (${ctx.ws.id}, ${lead.id}, ${body}, ${user.id})
      returning id, created_at`;
    await sql`update leads set updated_at = now() where id = ${lead.id}`;
    return { id: note.id, leadId: lead.id, body, authorName: user.name, createdAt: note.createdAt };
  });
}

/**
 * Kanaldan gelen mesajı işler; kullanıcısı yoktur, sunucu rolüyle çalışır. Gerçek sistemde bunu
 * kanal webhook'unun tetiklediği channel/inbound.process işi çağırır.
 * Aynı sohbetten gelen mesaj mevcut konuşmaya eklenir; konuşmanın açık bir lead'i yoksa yeni bir talep açılır.
 */
export function ingestInboundMessage(
  ws: string,
  input: { channelId?: Id; externalChatId: string; contactName: string; text: string },
): Promise<{ conversationId: Id; leadId: Id; created: boolean }> {
  return asService(async (sql) => {
    const [workspace] = await sql<Array<{ id: Id; currency: string }>>`select id, currency from workspaces where slug = ${ws}`;
    if (!workspace) throw notFound("workspace");
    const [channel] = await sql<Array<{ id: Id; kind: string; pipelineId: Id | null }>>`
      select id, kind, pipeline_id from channels
      where workspace_id = ${workspace.id} and ${input.channelId && isUuid(input.channelId) ? sql`id = ${input.channelId}` : sql`kind = 'telegram'`}
      order by created_at limit 1`;
    if (!channel) throw notFound("channel");

    let [conversation] = await sql<Array<{ id: Id; contactId: Id; leadId: Id | null }>>`
      select id, contact_id, lead_id from conversations where channel_id = ${channel.id} and external_chat_id = ${input.externalChatId} for update`;
    if (!conversation) {
      const [contact] = await sql<Array<{ id: Id }>>`insert into contacts (workspace_id, name) values (${workspace.id}, ${input.contactName}) returning id`;
      await sql`insert into contact_handles (workspace_id, contact_id, kind, value) values (${workspace.id}, ${contact.id}, ${channel.kind}, ${input.externalChatId})`;
      [conversation] = await sql<Array<{ id: Id; contactId: Id; leadId: Id | null }>>`
        insert into conversations (workspace_id, channel_id, contact_id, external_chat_id)
        values (${workspace.id}, ${channel.id}, ${contact.id}, ${input.externalChatId})
        returning id, contact_id, lead_id`;
    }

    let [lead] = conversation.leadId
      ? await sql<Array<{ id: Id }>>`select id from leads where id = ${conversation.leadId} and closed_at is null and deleted_at is null`
      : [];
    const created = !lead;
    if (!lead) {
      const [pipeline] = await sql<Array<{ id: Id; incomingEnabled: boolean }>>`
        select id, incoming_enabled from pipelines
        where workspace_id = ${workspace.id} and (id = ${channel.pipelineId} or is_main) and archived_at is null
        order by (id = ${channel.pipelineId}) desc nulls last limit 1`;
      const [stage] = await sql<Array<{ id: Id; kind: string }>>`
        select id, kind from stages
        where pipeline_id = ${pipeline.id} and kind = ${pipeline.incomingEnabled ? "incoming" : "open"}
        order by sort limit 1`;
      const [contact] = await sql<Array<{ companyId: Id | null }>>`select company_id from contacts where id = ${conversation.contactId}`;
      [lead] = await sql<Array<{ id: Id }>>`
        insert into leads (workspace_id, name, currency, pipeline_id, stage_id, company_id, incoming_category)
        values (${workspace.id}, ${channel.kind === "telegram" ? "Telegram talebi" : "WhatsApp talebi"}, ${workspace.currency},
                ${pipeline.id}, ${stage.id}, ${contact?.companyId ?? null}, ${stage.kind === "incoming" ? "chat" : null})
        returning id`;
      await sql`insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (${workspace.id}, ${lead.id}, ${conversation.contactId}, true)`;
      await sql`update conversations set lead_id = ${lead.id} where id = ${conversation.id}`;
      await sql`insert into events (workspace_id, type, lead_id, actor_kind) values (${workspace.id}, 'lead_created', ${lead.id}, 'system')`;
    }

    // Konuşmanın özeti, okunmamış sayısı ve lead'in son mesaj zamanı veritabanı tetikleyicisinde güncellenir.
    await sql`
      insert into messages (workspace_id, conversation_id, direction, sender_kind, body, status)
      values (${workspace.id}, ${conversation.id}, 'in', 'contact', ${input.text}, 'received')`;
    // Kapatılmış (ya da reddedilmiş) konuşmaya müşteri yeniden yazarsa konuşma açılır; yoksa gelen kutusunun
    // varsayılan görünümünde hiç görünmezdi.
    await sql`update conversations set status = 'open', closed_at = null where id = ${conversation.id} and status = 'closed'`;
    // Yeni talep, düştüğü aşamanın "lead oluşturuldu" otomasyonlarını çalıştırır (ör. sırayla dağıtım).
    if (created) {
      const [{ stageId }] = await sql<Array<{ stageId: Id }>>`select stage_id from leads where id = ${lead.id}`;
      await fireAutomations(sql, workspace.id, { type: "lead_created", leadId: lead.id, stageId });
    }
    return { conversationId: conversation.id, leadId: lead.id, created };
  });
}
