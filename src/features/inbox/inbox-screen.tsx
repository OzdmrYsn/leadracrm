"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleCheck, ExternalLink, Inbox, MessageSquare, RotateCcw, TriangleAlert } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ConversationItem } from "@/components/ui/crm";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/tag";
import { Composer } from "@/features/chat/composer";
import { Feed } from "@/features/chat/feed";
import { IncomingPanel } from "@/features/chat/incoming-panel";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { formatClock } from "@/lib/format";
import { useAssignConversation, useSetConversationStatus, useConversations, useMarkRead, useMessages, useNow, useSendMessage, useSession } from "@/lib/hooks";
import type { Conversation, FeedItem } from "@/lib/types";

const UNASSIGNED = "none";

function Thread({ ws, conversation, onBack }: { ws: string; conversation: Conversation; onBack: () => void }) {
  const { t } = useI18n();
  const session = useSession(ws);
  const messages = useMessages(ws, conversation.id);
  const send = useSendMessage(ws, conversation.id, session.data?.user.name ?? "");
  const markRead = useMarkRead(ws);
  const assign = useAssignConversation(ws);
  const setStatus = useSetConversationStatus(ws);
  const [assignProblem, setAssignProblem] = useState<string | null>(null);
  const now = useNow();
  const locale = session.data?.workspace.locale ?? "tr-TR";
  const timeZone = session.data?.workspace.timezone ?? "UTC";
  const dateFormat = session.data?.workspace.dateFormat ?? "text";
  const markReadMutate = markRead.mutate;
  const conversationId = conversation.id;
  const unread = conversation.unreadCount;

  // Konuşma açıkken gelen mesajlar okunmuş sayılır.
  useEffect(() => {
    if (unread > 0) markReadMutate(conversationId);
  }, [conversationId, unread, markReadMutate]);

  const items: FeedItem[] = (messages.data ?? []).map((message) => ({ kind: "message", at: message.createdAt, message }));

  return (
    <section aria-label={conversation.contactName} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-bg px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" iconOnly aria-label={t.inbox.backToList} onClick={onBack} className="md:hidden">
            <ArrowLeft aria-hidden />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-fg">{conversation.contactName}</h2>
            <p className="text-xs text-muted">{t.chat.channel[conversation.channel.kind]}</p>
          </div>
          {conversation.status === "closed" ? <Badge>{t.inbox.closed}</Badge> : null}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-44 min-w-0">
            <Select
              aria-label={t.inbox.assigneeLabel}
              value={conversation.assignedUserId ?? UNASSIGNED}
              disabled={assign.isPending}
              onValueChange={(next) => {
                setAssignProblem(null);
                assign.mutate(
                  { conversationId: conversation.id, userId: next === UNASSIGNED ? null : next },
                  { onError: (error) => setAssignProblem(errorText(error, t)) },
                );
              }}
              options={[
                { value: UNASSIGNED, label: t.common.unassigned },
                ...(session.data?.users ?? []).map((user) => ({ value: user.id, label: user.name })),
              ]}
            />
          </div>
          <Button
            icon={conversation.status === "closed" ? <RotateCcw aria-hidden /> : <CircleCheck aria-hidden />}
            loading={setStatus.isPending}
            onClick={() => {
              setAssignProblem(null);
              setStatus.mutate(
                { conversationId: conversation.id, status: conversation.status === "closed" ? "open" : "closed" },
                { onError: (error) => setAssignProblem(errorText(error, t)) },
              );
            }}
          >
            <span className="sr-only sm:not-sr-only">{conversation.status === "closed" ? t.inbox.reopen : t.inbox.close}</span>
          </Button>
          {conversation.leadId ? (
            <Link
              href={`/w/${ws}/leads/${conversation.leadId}`}
              className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-border-input bg-bg px-3 text-sm font-medium text-fg transition-colors hover:bg-surface"
            >
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only">{t.inbox.openLead}</span>
            </Link>
          ) : null}
        </div>
      </div>
      {assignProblem ? (
        <div className="px-4 pt-2">
          <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
            {assignProblem}
          </Notice>
        </div>
      ) : null}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.isPending ? (
          <div aria-busy className="flex flex-col gap-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
          </div>
        ) : messages.isError ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={t.common.loadFailed}
            action={
              <Button variant="secondary" onClick={() => void messages.refetch()}>
                {t.common.retry}
              </Button>
            }
          />
        ) : (
          <Feed ws={ws} items={items} now={now} locale={locale} timeZone={timeZone} dateFormat={dateFormat} label={t.chat.messages} />
        )}
      </div>
      {conversation.leadIsIncoming && conversation.leadId ? (
        <IncomingPanel
          ws={ws}
          leadId={conversation.leadId}
          contactName={conversation.contactName}
          channel={conversation.channel.kind}
          onDeclined={onBack}
        />
      ) : null}
      <Composer onSend={(body) => send.mutateAsync({ body, clientToken: crypto.randomUUID() })} />
    </section>
  );
}

export function InboxScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get("c");
  const session = useSession(ws);
  const now = useNow();
  const [status, setStatus] = useState<"open" | "all">("open");
  const [query, setQuery] = useState("");
  const conversations = useConversations(ws, status, query.trim());
  // Seçili konuşma süzgeç dışında kalsa bile açık kalmalı; bu yüzden tam listeden bulunur.
  const everything = useConversations(ws, "all", "");

  const locale = session.data?.workspace.locale ?? "tr-TR";
  const timeZone = session.data?.workspace.timezone ?? "UTC";
  const dateFormat = session.data?.workspace.dateFormat ?? "text";
  const list = conversations.data ?? [];
  const selected = (everything.data ?? []).find((conversation) => conversation.id === selectedId) ?? null;

  function select(id: string | null) {
    router.replace(id ? `${pathname}?c=${encodeURIComponent(id)}` : pathname, { scroll: false });
  }

  return (
    <>
      <ScreenHeader title={t.inbox.title} />
      <div className="flex min-h-0 flex-1">
        <section
          aria-label={t.inbox.list}
          className={cn("w-full shrink-0 flex-col border-r bg-bg md:flex md:w-(--layout-inbox-list)", selected ? "hidden" : "flex")}
        >
          <div className="flex flex-col gap-2 border-b p-3">
            <label htmlFor="inbox-search" className="sr-only">
              {t.inbox.searchLabel}
            </label>
            <Input
              id="inbox-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.inbox.searchPlaceholder}
            />
            <div role="group" aria-label={t.inbox.filterLabel} className="flex gap-1">
              {(["open", "all"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={status === option}
                  onClick={() => setStatus(option)}
                  className={cn(
                    "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                    status === option ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface-strong hover:text-fg",
                  )}
                >
                  {option === "open" ? t.inbox.filterOpen : t.inbox.filterAll}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.isPending ? (
              <div aria-busy className="flex flex-col gap-3 p-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : conversations.isError ? (
              <EmptyState
                icon={<TriangleAlert />}
                title={t.common.loadFailed}
                action={
                  <Button variant="secondary" onClick={() => void conversations.refetch()}>
                    {t.common.retry}
                  </Button>
                }
              />
            ) : list.length === 0 ? (
              query.trim() ? (
                <EmptyState icon={<Inbox />} title={t.inbox.noResultsTitle} body={t.inbox.noResultsBody} />
              ) : (
                <EmptyState icon={<Inbox />} title={t.inbox.emptyTitle} body={t.inbox.emptyBody} />
              )
            ) : (
              <ul className="flex flex-col divide-y">
                {list.map((conversation) => (
                  <li key={conversation.id}>
                    <ConversationItem
                      name={conversation.contactName}
                      channel={t.chat.channel[conversation.channel.kind]}
                      preview={conversation.lastMessagePreview ?? ""}
                      time={conversation.lastMessageAt ? formatClock(conversation.lastMessageAt, now, locale, timeZone, dateFormat) : ""}
                      unread={conversation.unreadCount}
                      unreadLabel={fill(t.nav.unread, { count: conversation.unreadCount })}
                      selected={conversation.id === selectedId}
                      locale={locale}
                      onClick={() => select(conversation.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {selected ? (
          <Thread key={selected.id} ws={ws} conversation={selected} onBack={() => select(null)} />
        ) : (
          <div className="hidden flex-1 items-center justify-center md:flex">
            <EmptyState icon={<MessageSquare />} title={t.inbox.pickTitle} body={t.inbox.pickBody} />
          </div>
        )}
      </div>
    </>
  );
}
