"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useCompleteTask, useTasks } from "@/lib/hooks";
import type { Task, TaskFilter } from "@/lib/types";

export function taskHref(ws: string, task: Task): string {
  const section = task.target.kind === "lead" ? "leads" : task.target.kind === "contact" ? "contacts" : "companies";
  return `/w/${ws}/${section}/${task.target.id}`;
}

/** Tek bir görev: tür, açıklama, son tarih, sorumlu ve tamamlama. Gecikme renkle birlikte yazıyla da söylenir. */
export function TaskRow({
  ws,
  task,
  now,
  locale,
  timeZone,
  showTarget = false,
  onProblem,
}: {
  ws: string;
  task: Task;
  now: number;
  locale: string;
  timeZone: string;
  /** Görevin bağlı olduğu kaydı bağlantı olarak gösterir (takvim için). */
  showTarget?: boolean;
  /** Tamamlama başarısız olursa hata metni. Satır listeden kalkacaksa (ör. başka sekmede tamamlanmış) hatayı liste gösterir. */
  onProblem?: (text: string | null) => void;
}) {
  const { t } = useI18n();
  const complete = useCompleteTask(ws);
  const [completing, setCompleting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const done = task.completedAt !== null;
  const overdue = !done && new Date(task.dueAt).getTime() < now;
  const title = task.text || task.typeName;
  const resultId = `task-result-${task.id}`;

  // mutate'in çağrıya özel geri çağrıları, satır o sırada listeden kalkarsa çalışmaz (görev başka sekmede
  // tamamlanmışsa liste yenilenir ve satır gider). Bu yüzden sonuç burada beklenir.
  async function submit() {
    setError(null);
    onProblem?.(null);
    try {
      await complete.mutateAsync({ taskId: task.id, resultText: result.trim() || undefined });
      setCompleting(false);
    } catch (problem) {
      setError(errorText(problem, t));
      onProblem?.(errorText(problem, t));
    }
  }

  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border bg-bg p-2 shadow-card", overdue && "border-danger")}>
      {/* Dar alanda "Tamamla" alt satıra iner; metin sıkışmaz. */}
      <div className="flex flex-wrap items-start gap-2">
        <span aria-hidden className={cn("mt-0.5 shrink-0", done ? "text-success" : overdue ? "text-danger" : "text-muted")}>
          {done ? <CircleCheck className="size-4" /> : overdue ? <TriangleAlert className="size-4" /> : <Clock className="size-4" />}
        </span>
        <div className="min-w-0 flex-1 basis-36">
          <p className={cn("text-sm break-words", done ? "text-muted" : "text-fg")}>{title}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {task.text ? <Badge>{task.typeName}</Badge> : null}
            <time dateTime={task.dueAt} className={overdue ? "font-medium text-danger" : undefined}>
              {formatDateTime(task.dueAt, locale, timeZone)}
            </time>
            {overdue ? <span className="font-medium text-danger">{t.tasks.overdue}</span> : null}
            {done ? <span>{t.tasks.done}</span> : null}
            {showTarget ? (
              <Link href={taskHref(ws, task)} className="max-w-full truncate rounded-sm text-fg underline underline-offset-2">
                {task.target.name}
              </Link>
            ) : null}
          </p>
          {done && task.resultText ? (
            <p className="pt-1 text-xs text-muted">
              {t.tasks.result}: {task.resultText}
            </p>
          ) : null}
        </div>
        {task.responsible ? <Avatar name={task.responsible.name} size="sm" locale={locale} /> : null}
        {!done && !completing ? (
          <Button size="sm" className="ml-auto" onClick={() => setCompleting(true)} aria-label={fill(t.tasks.completeLabel, { task: title })}>
            {t.tasks.complete}
          </Button>
        ) : null}
      </div>
      {completing ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={resultId} className="text-xs text-muted">
            {t.tasks.result}
          </label>
          <Input
            id={resultId}
            value={result}
            onChange={(event) => setResult(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
              if (event.key === "Escape") setCompleting(false);
            }}
            placeholder={t.tasks.resultPlaceholder}
            maxLength={2000}
            autoFocus
          />
          {error && !onProblem ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCompleting(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="primary" size="sm" loading={complete.isPending} onClick={() => void submit()}>
              {t.tasks.confirmComplete}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Bir kaydın görevleri. Boşsa kısa bir metin gösterir. */
export function TaskList({
  ws,
  filter,
  now,
  locale,
  timeZone,
  emptyText,
  showTarget = false,
}: {
  ws: string;
  filter: TaskFilter;
  now: number;
  locale: string;
  timeZone: string;
  emptyText: string;
  showTarget?: boolean;
}) {
  const tasks = useTasks(ws, filter);
  const [problem, setProblem] = useState<string | null>(null);
  if (tasks.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  const list = tasks.data ?? [];
  // Hata, satır listeden kalksa da görünür kalsın diye burada gösterilir.
  const alert = problem ? (
    <p role="alert" className="text-xs text-danger">
      {problem}
    </p>
  ) : null;
  if (list.length === 0) {
    return (
      <>
        {alert}
        <p className="text-sm text-muted">{emptyText}</p>
      </>
    );
  }
  return (
    <>
      {alert}
      <ul className="flex flex-col gap-2">
        {list.map((task) => (
          <TaskRow key={task.id} ws={ws} task={task} now={now} locale={locale} timeZone={timeZone} showTarget={showTarget} onProblem={setProblem} />
        ))}
      </ul>
    </>
  );
}
