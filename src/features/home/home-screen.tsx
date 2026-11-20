"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Cable, CalendarPlus, Check, MessageSquare, Plus, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { fill, useI18n } from "@/i18n";
import { dayOf, dayRange, timeOf } from "@/lib/dates";
import { formatClock, formatMoney } from "@/lib/format";
import { useConversations, useInsights, useNow, useSession, useTasks } from "@/lib/hooks";
import type { Stage } from "@/lib/types";

/** Saat dilimine göre günün selamı: sabah 5-12, gündüz 12-18, akşam 18-5. */
function greetingKey(hour: number): "morning" | "day" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "evening";
}

/** "Bugün": güne başlarken bakılan ekran. Selam, günün özeti, satış hattı şeridi, yapılacaklar ve yanıt bekleyenler. */
export function HomeScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const h = t.home;
  const session = useSession(ws);
  const now = useNow();
  const locale = session.data?.workspace.locale ?? "tr-TR";
  const timeZone = session.data?.workspace.timezone ?? "Europe/Istanbul";
  const dateFormat = session.data?.workspace.dateFormat ?? "text";
  const today = dayOf(now, timeZone);
  const insights = useInsights(ws, 7, "");
  const tasks = useTasks(ws, { ...dayRange(today, today, timeZone), responsible: "me", status: "open" }, Boolean(session.data));
  const overdue = useTasks(ws, { to: new Date(Math.floor(now / 60_000) * 60_000).toISOString(), responsible: "me", status: "open" }, Boolean(session.data));
  const conversations = useConversations(ws, "open", "");

  const root = `/w/${ws}`;
  const firstName = (session.data?.user.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hour = Number(timeOf(now, timeZone).slice(0, 2));
  const date = new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "long", weekday: "long" }).format(now);
  const currency = session.data?.workspace.currency ?? "TRY";
  const money = (minor: number) => formatMoney(minor, currency, locale);

  const late = (overdue.data ?? []).filter((task) => new Date(task.dueAt).getTime() < now);
  const lateIds = new Set(late.map((task) => task.id));
  const due = [...late, ...(tasks.data ?? []).filter((task) => !lateIds.has(task.id))].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const waiting = (conversations.data ?? []).filter((conversation) => conversation.unreadCount > 0);
  const unread = waiting.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  const stageById = new Map<string, Stage>((session.data?.pipelines ?? []).flatMap((pipeline) => pipeline.stages).map((stage) => [stage.id, stage]));
  const mainPipeline = session.data?.pipelines.find((pipeline) => pipeline.isMain)?.name;
  const stages = (insights.data?.stages ?? []).filter((stage) => !mainPipeline || stage.pipeline === mainPipeline);
  const totals = insights.data?.totals;

  const summary =
    due.length === 0 && unread === 0
      ? h.summaryClear
      : [due.length > 0 ? fill(h.summaryTasks, { count: due.length }) : null, unread > 0 ? fill(h.summaryUnread, { count: unread }) : null].filter(Boolean).join(" ");

  const actions = [
    { href: `${root}/pipelines`, label: h.actionLead, body: h.actionLeadBody, icon: Plus },
    { href: `${root}/sources`, label: h.actionSource, body: h.actionSourceBody, icon: Cable },
    { href: `${root}/calendar`, label: h.actionTask, body: h.actionTaskBody, icon: CalendarPlus },
  ] as const;

  const stats = [
    { label: h.statOpen, value: totals ? money(totals.openMinor) : null, detail: totals ? fill(t.insights.leadCount, { count: totals.open }) : "" },
    { label: h.statNew, value: totals ? String(totals.created) : null, detail: h.statWeek },
    { label: h.statWon, value: totals ? money(totals.wonMinor) : null, detail: totals ? fill(h.statWonDetail, { count: totals.won }) : "" },
  ];
  const pipelineTotal = stages.reduce((sum, stage) => sum + stage.totalMinor, 0);

  const sectionTitle = "text-sm font-bold tracking-wide text-fg uppercase";
  const sectionLink = "inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-accent underline-offset-4 hover:underline";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="shrink-0 border-b bg-bg">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-muted first-letter:uppercase">{date}</p>
            <h1 className="font-display text-xl text-balance text-fg md:text-2xl">{firstName ? fill(h.greeting[greetingKey(hour)], { name: firstName }) : h.title}</h1>
            <p className="max-w-xl text-base text-pretty text-muted">{summary}</p>
          </div>
          <dl className="grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1 px-4 py-3.5 md:px-5">
                <dt className="text-sm text-muted">{stat.label}</dt>
                <dd className="font-display text-xl text-fg tabular-nums">{stat.value ?? "…"}</dd>
                <dd className="text-xs text-muted">{stat.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        <section aria-labelledby="home-pipeline" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="home-pipeline" className={sectionTitle}>
              {h.pipelineTitle}
            </h2>
            <Link href={`${root}/pipelines`} className={sectionLink}>
              {h.openBoard}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          {insights.isPending ? (
            <Skeleton className="h-28 w-full rounded-lg" />
          ) : stages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-input bg-bg px-4 py-6 text-sm text-muted">{t.insights.stagesNone}</p>
          ) : (
            <div className="overflow-clip rounded-lg border bg-bg">
              {/* Şerit: her aşamanın payı, içindeki tutarla orantılıdır. Süstür; rakamlar aşağıda yazar. */}
              {pipelineTotal > 0 ? (
                <div aria-hidden className="flex h-1.5 w-full">
                  {stages.map((stage) => (
                    <span key={stage.id} style={{ background: `var(--stage-strong-${stageById.get(stage.id)?.color ?? 8})`, flex: `${stage.totalMinor} 1 0%` }} />
                  ))}
                </div>
              ) : null}
              <ol className="grid grid-cols-2 divide-x md:flex md:divide-x">
                {stages.map((stage) => (
                  <li key={stage.id} className="flex min-w-0 flex-1 flex-col gap-2 border-b px-4 py-3.5 md:border-b-0">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="size-2 shrink-0 rounded-pill" style={{ background: `var(--stage-strong-${stageById.get(stage.id)?.color ?? 8})` }} />
                      <span className="min-w-0 truncate text-xs font-bold tracking-wide text-fg uppercase">{stage.name}</span>
                    </span>
                    <span className="font-display text-lg text-fg tabular-nums">{money(stage.totalMinor)}</span>
                    <span className="text-xs text-muted">{fill(t.insights.leadCount, { count: stage.count })}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="home-tasks" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="home-tasks" className={sectionTitle}>
                {h.tasksTitle}
              </h2>
              <Link href={`${root}/calendar`} className={sectionLink}>
                {h.openCalendar}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <div className="overflow-clip rounded-lg border bg-bg">
              {tasks.isPending ? (
                <div aria-busy className="p-4">
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : due.length === 0 ? (
                <EmptyState icon={<Check />} title={h.tasksEmptyTitle} body={h.tasksEmptyBody} />
              ) : (
                <ul className="flex flex-col divide-y">
                  {due.slice(0, 6).map((task) => {
                    const isLate = lateIds.has(task.id);
                    const href = task.target.kind === "lead" ? `${root}/leads/${task.target.id}` : task.target.kind === "contact" ? `${root}/contacts/${task.target.id}` : `${root}/companies/${task.target.id}`;
                    return (
                      <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                        <span
                          aria-hidden
                          className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4", isLate ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent")}
                        >
                          {isLate ? <TriangleAlert /> : <Check />}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <p className="text-sm font-medium break-words text-fg">{task.text || task.typeName}</p>
                          <p className="text-xs text-muted">
                            <Link href={href} className="rounded-sm font-semibold text-accent underline-offset-2 hover:underline">
                              {task.target.name}
                            </Link>
                          </p>
                        </div>
                        <p className={cn("shrink-0 text-xs font-medium", isLate ? "text-danger" : "text-muted")}>{isLate ? h.late : formatClock(task.dueAt, now, locale, timeZone, dateFormat)}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="home-waiting" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="home-waiting" className={sectionTitle}>
                {h.waitingTitle}
              </h2>
              <Link href={`${root}/inbox`} className={sectionLink}>
                {h.openInbox}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <div className="overflow-clip rounded-lg border bg-bg">
              {conversations.isPending ? (
                <div aria-busy className="p-4">
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : waiting.length === 0 ? (
                <EmptyState icon={<MessageSquare />} title={h.waitingEmptyTitle} body={h.waitingEmptyBody} />
              ) : (
                <ul className="flex flex-col divide-y">
                  {waiting.slice(0, 6).map((conversation) => (
                    <li key={conversation.id}>
                      <Link href={`${root}/inbox?c=${conversation.id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface">
                        <Avatar name={conversation.contactName} locale={locale} decorative />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-semibold text-accent">{conversation.contactName}</span>
                          <span className="truncate text-sm text-muted">{conversation.lastMessagePreview ?? ""}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-xs text-muted">{conversation.lastMessageAt ? formatClock(conversation.lastMessageAt, now, locale, timeZone, dateFormat) : ""}</span>
                          <span className="rounded-pill bg-danger px-2 text-xs text-on-danger">
                            {conversation.unreadCount}
                            <span className="sr-only"> {h.unreadSuffix}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <section aria-labelledby="home-actions" className="flex flex-col gap-3">
          <h2 id="home-actions" className={sectionTitle}>
            {h.actionsTitle}
          </h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.href}>
                  <Link href={action.href} className="group flex h-full items-start gap-3 rounded-lg border bg-bg p-4 transition-[border-color,box-shadow] hover:border-accent hover:shadow-card">
                    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-5">
                      <Icon />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-accent">{action.label}</span>
                      <span className="text-sm text-muted">{action.body}</span>
                    </span>
                    <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted transition-transform duration-(--motion-base) group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
