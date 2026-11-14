"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { LeadPicker } from "@/features/leads/lead-picker";
import { useI18n } from "@/i18n";
import { addDays, dayOf, isDay, isTime, timeOf, zonedToUtc } from "@/lib/dates";
import { errorText } from "@/lib/errors";
import { useCreateTask } from "@/lib/hooks";
import type { EntityType, Id, Session } from "@/lib/types";

export type TaskTarget = { kind: EntityType; id: Id; name: string };

const UNASSIGNED = "none";
const HOUR = 3_600_000;

function TaskForm({
  ws,
  session,
  target,
  initialDay,
  onDone,
}: {
  ws: string;
  session: Session;
  target?: TaskTarget;
  initialDay?: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const create = useCreateTask(ws);
  const timeZone = session.workspace.timezone;

  const [picked, setPicked] = useState<TaskTarget | null>(target ?? null);
  const [typeId, setTypeId] = useState(session.taskTypes[0]?.id ?? "");
  const [text, setText] = useState("");
  const [day, setDay] = useState(() => initialDay ?? addDays(dayOf(Date.now(), timeZone), 1));
  const [time, setTime] = useState("10:00");
  const [responsible, setResponsible] = useState(session.user.id);
  const [errors, setErrors] = useState<{ target?: string; due?: string; form?: string }>({});

  const presets = [
    { label: t.tasks.inAnHour, apply: () => [dayOf(Date.now() + HOUR, timeZone), timeOf(Date.now() + HOUR, timeZone)] },
    { label: t.tasks.today, apply: () => [dayOf(Date.now(), timeZone), "18:00"] },
    { label: t.tasks.tomorrow, apply: () => [addDays(dayOf(Date.now(), timeZone), 1), "10:00"] },
    { label: t.tasks.nextWeek, apply: () => [addDays(dayOf(Date.now(), timeZone), 7), "10:00"] },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!picked) next.target = t.tasks.targetRequired;
    if (!isDay(day) || !isTime(time)) next.due = t.tasks.dueRequired;
    setErrors(next);
    if (!picked || next.due) return;

    create.mutate(
      {
        leadId: picked.kind === "lead" ? picked.id : undefined,
        contactId: picked.kind === "contact" ? picked.id : undefined,
        companyId: picked.kind === "company" ? picked.id : undefined,
        typeId,
        text,
        dueAt: zonedToUtc(day, time, timeZone).toISOString(),
        responsibleUserId: responsible === UNASSIGNED ? null : responsible,
      },
      { onSuccess: onDone, onError: (problem) => setErrors({ form: errorText(problem, t) }) },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.form ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {errors.form}
        </Notice>
      ) : null}

      {target ? null : (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-fg">
            {t.tasks.target}
            <span aria-hidden className="text-danger">
              {" "}
              *
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {picked ? <span className="min-w-0 truncate text-sm text-fg">{picked.name}</span> : null}
            <LeadPicker
              ws={ws}
              locale={session.workspace.locale}
              onPick={(lead) => {
                setPicked({ kind: "lead", id: lead.id, name: lead.name });
                setErrors((current) => ({ ...current, target: undefined }));
              }}
              trigger={<Button size="sm">{picked ? t.leadPicker.change : t.leadPicker.pick}</Button>}
            />
          </div>
          {errors.target ? (
            <p role="alert" className="text-xs text-danger">
              {errors.target}
            </p>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="task-type" label={t.tasks.type}>
          <Select id="task-type" value={typeId} onValueChange={setTypeId} options={session.taskTypes.map((type) => ({ value: type.id, label: type.name }))} />
        </Field>
        <Field id="task-responsible" label={t.tasks.responsible}>
          <Select
            id="task-responsible"
            value={responsible}
            onValueChange={setResponsible}
            options={[...session.users.map((user) => ({ value: user.id, label: user.name })), { value: UNASSIGNED, label: t.common.unassigned }]}
          />
        </Field>
      </div>

      <Field id="task-text" label={t.tasks.text}>
        <Input id="task-text" value={text} onChange={(event) => setText(event.target.value)} placeholder={t.tasks.textPlaceholder} maxLength={2000} autoFocus={Boolean(target)} />
      </Field>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label={t.tasks.presets} className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              size="sm"
              onClick={() => {
                const [nextDay, nextTime] = preset.apply();
                setDay(nextDay);
                setTime(nextTime);
                setErrors((current) => ({ ...current, due: undefined }));
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="task-day" label={t.tasks.date} required>
            <Input id="task-day" type="date" value={day} onChange={(event) => setDay(event.target.value)} aria-invalid={errors.due ? true : undefined} required />
          </Field>
          <Field id="task-time" label={t.tasks.time} required>
            <Input id="task-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-invalid={errors.due ? true : undefined} required />
          </Field>
        </div>
        {errors.due ? (
          <p role="alert" className="text-xs text-danger">
            {errors.due}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t.tasks.submit}
        </Button>
      </div>
    </form>
  );
}

/** Yeni görev penceresi. target verilirse görev o kayda bağlanır; verilmezse bir lead seçilir. */
export function TaskDialog({
  ws,
  session,
  target,
  initialDay,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  session: Session;
  target?: TaskTarget;
  /** Takvimden açıldığında seçili gün. */
  initialDay?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={t.tasks.newTitle}
      description={target ? target.name : t.tasks.newBody}
      closeLabel={t.common.close}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
    >
      <TaskForm ws={ws} session={session} target={target} initialDay={initialDay} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
