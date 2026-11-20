"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Button, ToggleButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { fill, useI18n } from "@/i18n";
import { addDays, addMonths, dayOf, dayRange, monthGrid, weekDays, zonedToUtc } from "@/lib/dates";
import { formatTime } from "@/lib/format";
import { useNow, useSession, useTasks } from "@/lib/hooks";
import type { Task } from "@/lib/types";
import { TaskDialog } from "./task-dialog";
import { taskHref, TaskRow } from "./task-list";

type View = "day" | "week" | "month";

/** Gün etiketleri saat diliminden bağımsız olsun diye günün öğlesi alınır. */
const noon = (day: string, timeZone: string) => zonedToUtc(day, "12:00", timeZone);

function Chip({ ws, task, now, locale, timeZone }: { ws: string; task: Task; now: number; locale: string; timeZone: string }) {
  const { t } = useI18n();
  const done = task.completedAt !== null;
  const overdue = !done && new Date(task.dueAt).getTime() < now;
  return (
    <Link
      href={taskHref(ws, task)}
      title={`${task.text || task.typeName} · ${task.target.name}`}
      className={cn(
        // min-h-6: aynı güne birden çok görev düşünce alt alta dizilen bağlantılar en az 24 piksel yüksek kalır.
        "flex min-h-6 items-center gap-1 truncate rounded-sm px-1 text-xs transition-colors",
        done ? "bg-surface text-muted" : overdue ? "bg-danger-soft text-danger" : "bg-accent-soft text-fg hover:bg-surface-strong",
      )}
    >
      {done ? <Check aria-hidden className="size-3 shrink-0" /> : null}
      <span className="shrink-0 tabular-nums">{formatTime(task.dueAt, locale, timeZone)}</span>
      <span className="truncate">{task.text || task.typeName}</span>
      {done ? <span className="sr-only">{t.tasks.done}</span> : overdue ? <span className="sr-only">{t.tasks.overdue}</span> : null}
    </Link>
  );
}

export function CalendarScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const session = useSession(ws);
  const now = useNow();
  const timeZone = session.data?.workspace.timezone ?? "UTC";
  const locale = session.data?.workspace.locale ?? "tr-TR";
  const dateFormat = session.data?.workspace.dateFormat ?? "text";
  const today = dayOf(now, timeZone);

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [scope, setScope] = useState<"me" | "all">("me");
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);

  const day = anchor ?? today;
  const days = view === "day" ? [day] : view === "week" ? weekDays(day) : monthGrid(day);
  const range = dayRange(days[0], days[days.length - 1], timeZone);
  const responsible = scope === "me" ? "me" : undefined;
  const tasks = useTasks(ws, { ...range, responsible, status: "all" }, Boolean(session.data));
  // Geciken açık görevler: görünen aralıktan bağımsız, her zaman üstte.
  const overdue = useTasks(ws, { to: new Date(Math.floor(now / 60_000) * 60_000).toISOString(), responsible, status: "open" }, Boolean(session.data));

  const byDay = new Map<string, Task[]>();
  for (const task of tasks.data ?? []) {
    const key = dayOf(task.dueAt, timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), task]);
  }
  const late = (overdue.data ?? []).filter((task) => new Date(task.dueAt).getTime() < now);

  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, ...options });
  const heading =
    view === "month"
      ? format({ month: "long", year: "numeric" }).format(noon(day, timeZone))
      : view === "day"
        ? format({ dateStyle: "full" }).format(noon(day, timeZone))
        : format({ day: "numeric", month: "short", year: "numeric" }).formatRange(noon(days[0], timeZone), noon(days[6], timeZone));
  const weekday = (value: string) => format({ weekday: "short" }).format(noon(value, timeZone));
  const dayLabel = (value: string) => format({ day: "numeric", month: "long", weekday: "long" }).format(noon(value, timeZone));

  function shift(direction: -1 | 1) {
    setAnchor(view === "day" ? addDays(day, direction) : view === "week" ? addDays(day, direction * 7) : addMonths(day, direction));
  }

  function openDay(value: string) {
    setAnchor(value);
    setView("day");
  }

  return (
    <>
      <ScreenHeader title={t.calendar.title}>
        <div role="group" aria-label={t.calendar.scopeLabel} className="flex gap-1">
          <ToggleButton pressed={scope === "me"} onClick={() => setScope("me")}>
            {t.calendar.mine}
          </ToggleButton>
          <ToggleButton pressed={scope === "all"} onClick={() => setScope("all")}>
            {t.calendar.everyone}
          </ToggleButton>
        </div>
        <Button ref={addRef} variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setAdding(true)} disabled={!session.data}>
          {t.tasks.add}
        </Button>
      </ScreenHeader>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-bg px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" iconOnly aria-label={t.calendar.previous} onClick={() => shift(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" iconOnly aria-label={t.calendar.next} onClick={() => shift(1)}>
            <ChevronRight aria-hidden />
          </Button>
          <Button size="sm" onClick={() => setAnchor(null)} disabled={day === today}>
            {t.calendar.today}
          </Button>
          <h2 aria-live="polite" className="px-2 text-sm font-semibold text-fg">
            {heading}
          </h2>
        </div>
        <div role="group" aria-label={t.calendar.viewLabel} className="flex gap-1">
          {(["day", "week", "month"] as const).map((option) => (
            <ToggleButton key={option} pressed={view === option} onClick={() => setView(option)}>
              {t.calendar.views[option]}
            </ToggleButton>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {late.length > 0 ? (
          <section aria-label={fill(t.calendar.overdue, { count: late.length })} className="flex flex-col gap-2 rounded-lg bg-danger-soft p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-danger">
              <TriangleAlert aria-hidden className="size-4" />
              {fill(t.calendar.overdue, { count: late.length })}
            </h3>
            <ul className="flex flex-col gap-2">
              {late.map((task) => (
                <TaskRow key={task.id} ws={ws} task={task} now={now} locale={locale} timeZone={timeZone} dateFormat={dateFormat} showTarget />
              ))}
            </ul>
          </section>
        ) : null}

        {tasks.isPending || !session.data ? (
          <div aria-busy className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : tasks.isError ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={t.common.loadFailed}
            action={
              <Button variant="secondary" onClick={() => void tasks.refetch()}>
                {t.common.retry}
              </Button>
            }
          />
        ) : view === "day" ? (
          (byDay.get(day) ?? []).length === 0 ? (
            <p className="text-sm text-muted">{t.calendar.emptyRange}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(byDay.get(day) ?? []).map((task) => (
                <TaskRow key={task.id} ws={ws} task={task} now={now} locale={locale} timeZone={timeZone} dateFormat={dateFormat} showTarget />
              ))}
            </ul>
          )
        ) : view === "week" ? (
          <ol className="grid grid-cols-1 gap-2 md:grid-cols-7">
            {days.map((value) => {
              const list = byDay.get(value) ?? [];
              return (
                <li key={value} className={cn("flex min-h-24 flex-col gap-1 rounded-lg border bg-bg p-2 shadow-card md:min-h-64", value === today && "border-t-4 border-accent")}>
                  <button
                    type="button"
                    onClick={() => openDay(value)}
                    aria-current={value === today ? "date" : undefined}
                    className="flex min-h-6 items-baseline gap-2 rounded-sm text-left text-xs text-muted hover:text-fg"
                  >
                    <span className="uppercase">{weekday(value)}</span>
                    <span className={cn("text-sm font-semibold", value === today ? "rounded-pill bg-accent px-2 text-on-accent" : "text-muted")}>{Number(value.slice(8))}</span>
                    <span className="sr-only">{fill(t.calendar.dayTasks, { day: dayLabel(value), count: list.length })}</span>
                  </button>
                  {list.length === 0 ? (
                    <span className="text-xs text-muted">{t.calendar.emptyDay}</span>
                  ) : (
                    list.map((task) => <Chip key={task.id} ws={ws} task={task} now={now} locale={locale} timeZone={timeZone} />)
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="flex flex-col">
            <div aria-hidden className="grid grid-cols-7 text-center text-xs text-muted uppercase">
              {days.slice(0, 7).map((value) => (
                <span key={value} className="py-1">
                  {weekday(value)}
                </span>
              ))}
            </div>
            <ol className="grid grid-cols-7 overflow-clip rounded-lg border-t border-l bg-bg shadow-card">
              {days.map((value) => {
                const list = byDay.get(value) ?? [];
                const outside = value.slice(0, 7) !== day.slice(0, 7);
                return (
                  <li key={value} className={cn("flex min-h-16 min-w-0 flex-col gap-1 border-r border-b p-1 sm:min-h-24", outside && "bg-surface")}>
                    <button
                      type="button"
                      onClick={() => openDay(value)}
                      aria-label={fill(t.calendar.dayTasks, { day: dayLabel(value), count: list.length })}
                      aria-current={value === today ? "date" : undefined}
                      className={cn(
                        "flex size-6 items-center justify-center rounded-pill text-xs transition-colors hover:bg-surface-strong",
                        value === today ? "bg-accent font-semibold text-on-accent hover:bg-accent-hover" : outside ? "text-muted" : "text-fg",
                      )}
                    >
                      {Number(value.slice(8))}
                    </button>
                    <div className="hidden flex-col gap-1 sm:flex">
                      {list.slice(0, 3).map((task) => (
                        <Chip key={task.id} ws={ws} task={task} now={now} locale={locale} timeZone={timeZone} />
                      ))}
                      {list.length > 3 ? <span className="px-1 text-xs text-muted">{fill(t.calendar.more, { count: list.length - 3 })}</span> : null}
                    </div>
                    {list.length > 0 ? (
                      <span aria-hidden className="flex size-5 items-center justify-center rounded-pill bg-accent-soft text-xs text-fg sm:hidden">
                        {list.length}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {session.data ? (
        <TaskDialog ws={ws} session={session.data} initialDay={view === "day" ? day : undefined} open={adding} onOpenChange={setAdding} returnFocusTo={addRef} />
      ) : null}
    </>
  );
}
