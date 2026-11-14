"use client";

import { useEffect, useRef } from "react";
import { MessageBubble, type MessageStatus as BubbleStatus } from "@/components/ui/crm";
import { fill, useI18n } from "@/i18n";
import { formatClock } from "@/lib/format";
import type { FeedItem, LeadEvent } from "@/lib/types";

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
  items,
  now,
  locale,
  timeZone,
  label,
}: {
  items: FeedItem[];
  now: number;
  locale: string;
  timeZone: string;
  label: string;
}) {
  const { t } = useI18n();
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
                time={formatClock(message.createdAt, now, locale, timeZone)}
                status={status}
                statusLabel={status ? t.chat.status[status] : undefined}
                author={message.senderName ?? undefined}
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
                {t.chat.note} · {item.note.authorName} · <time>{formatClock(item.note.createdAt, now, locale, timeZone)}</time>
              </p>
              <p className="text-sm break-words whitespace-pre-wrap text-fg">{item.note.body}</p>
            </li>
          );
        }
        return (
          <li key={`e-${item.event.id}`} className="text-center text-xs text-muted">
            {eventText(item.event, t)} · <time>{formatClock(item.event.createdAt, now, locale, timeZone)}</time>
          </li>
        );
      })}
      <div ref={endRef} aria-hidden />
    </ol>
  );
}
