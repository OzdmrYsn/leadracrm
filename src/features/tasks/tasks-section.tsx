"use client";

import { useId, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n";
import type { Session, TaskFilter } from "@/lib/types";
import { TaskDialog, type TaskTarget } from "./task-dialog";
import { TaskList } from "./task-list";

/** Bir kaydın açık görevleri ve "Görev ekle". panel: kartın dar sol sütunu için sade başlık. */
export function TasksSection({
  ws,
  session,
  target,
  now,
  variant = "page",
}: {
  ws: string;
  session: Session;
  target: TaskTarget;
  now: number;
  variant?: "page" | "panel";
}) {
  const { t } = useI18n();
  const headingId = useId();
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const filter: TaskFilter = {
    status: "open",
    leadId: target.kind === "lead" ? target.id : undefined,
    contactId: target.kind === "contact" ? target.id : undefined,
    companyId: target.kind === "company" ? target.id : undefined,
  };

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-2", variant === "panel" && "px-2 py-1")}>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 id={headingId} className={variant === "panel" ? "text-xs text-muted" : "text-sm font-semibold text-fg"}>
          {t.tasks.open}
        </h2>
        <Button ref={addRef} variant="ghost" size="sm" icon={<CalendarPlus aria-hidden />} onClick={() => setAdding(true)}>
          {t.tasks.add}
        </Button>
      </div>
      <TaskList ws={ws} filter={filter} now={now} locale={session.workspace.locale} timeZone={session.workspace.timezone} emptyText={t.tasks.none} />
      <TaskDialog ws={ws} session={session} target={target} open={adding} onOpenChange={setAdding} returnFocusTo={addRef} />
    </section>
  );
}
