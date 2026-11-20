"use client";

import { useEffect, useRef } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageBubble, type MessageStatus as BubbleStatus } from "@/components/ui/crm";
import { fill, useI18n } from "@/i18n";
import { formatClock } from "@/lib/format";
import { useRetryMessage } from "@/lib/hooks";
import type { DateFormat, FeedItem, LeadEvent } from "@/lib/types";

export function eventText(event: LeadEvent, t: ReturnType<typeof useI18n>["t"]): string {
  // Olayı bir tetikleyici yaptıysa kullanıcı adı yerine "Otomasyon" yazılır.
  const actor = event.actorKind === "automation" ? t.event.byAutomation : (event.actorName ?? "");
  switch (event.type) {
    case "lead_created":
      if (event.actorKind === "integration") return t.event.createdIntake;
      return event.actorName ? fill(t.event.created, { actor }) : t.event.createdAuto;
    case "lead_accepted":
      return fill(t.event.accepted, { actor });
    case "request_linked":
      return event.to ? fill(t.event.linkedFrom, { actor, name: event.to }) : fill(t.event.linked, { actor });
    case "stage_changed":
      return fill(t.event.stageChanged, { actor, from: event.from ?? "", to: event.to ?? "" });
    case "responsible_changed":
      return event.to ? fill(t.event.responsibleChanged, { actor, to: event.to }) : fill(t.event.responsibleCleared, { actor });
    case "task_added":
      return fill(t.event.taskAdded, { actor, task: event.to ?? "" });
    case "task_completed":
      return event.from
        ? fill(t.event.taskCompletedResult, { actor, task: event.to ?? "", result: event.from })
        : fill(t.event.taskCompleted, { actor, task: event.to ?? "" });
  }
}

/**
 * Mesajlar, notlar ve sistem olayları tek akışta. Yeni öğe gelince en alta kayar.
 * Kaydırılan kap üst bileşendedir; bu bileşen yalnız içeriği çizer.
 */
export function Feed({
  ws,
  items,
  now,
  locale,
  timeZone,
  dateFormat = "text",
  label,
}: {
  ws: string;
  items: FeedItem[];
  now: number;
  locale: string;
  timeZone: string;
  dateFormat?: DateFormat;
  label: string;
}) {
  const { t } = useI18n();
  const retry = useRetryMessage(ws);
  const endRef = useRef<HTMLDivElement>(null);
  const count = items.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  return (
    <ol aria-label={label} className="flex flex-col gap-3">
      {items.map((item) => {
        if (item.kind === "message") {
          const { message } = item;
          const outgoing = message.direction === "out";
          const status = outgoing && message.status !== "received" ? (message.status as BubbleStatus) : undefined;
          return (
            <li key={`m-${message.clientToken ?? message.id}`}>
              <MessageBubble
                direction={message.direction}
                time={formatClock(message.createdAt, now, locale, timeZone, dateFormat)}
                status={status}
                statusLabel={status ? t.chat.status[status] : undefined}
                author={message.senderName ?? undefined}
                failure={status === "failed" ? ((t.chat.failReasons as Record<string, string>)[message.errorCode ?? ""] ?? undefined) : undefined}
                action={
                  status === "failed" && !message.id.startsWith("pending-") ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<RotateCw aria-hidden />}
                      loading={retry.isPending && retry.variables?.messageId === message.id}
                      aria-label={fill(t.chat.retryLabel, { text: message.body.slice(0, 40) })}
                      onClick={() => retry.mutate({ conversationId: message.conversationId, messageId: message.id })}
                    >
                      {t.chat.retry}
                    </Button>
                  ) : undefined
                }
              >
                {message.body}
              </MessageBubble>
            </li>
          );
        }
        if (item.kind === "note") {
          return (
            <li key={`n-${item.note.id}`} className="rounded-lg bg-warning-soft px-3 py-2 shadow-card">
              <p className="text-xs text-warning">
                {t.chat.note} · {item.note.authorName} · <time>{formatClock(item.note.createdAt, now, locale, timeZone, dateFormat)}</time>
              </p>
              <p className="text-sm break-words whitespace-pre-wrap text-fg">{item.note.body}</p>
            </li>
          );
        }
        return (
          <li key={`e-${item.event.id}`} className="text-center text-xs text-muted">
            {eventText(item.event, t)} · <time>{formatClock(item.event.createdAt, now, locale, timeZone, dateFormat)}</time>
          </li>
        );
      })}
      <div ref={endRef} aria-hidden />
    </ol>
  );
}
