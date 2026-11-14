"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, ToggleButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateAutomation, useUpdateAutomation } from "@/lib/hooks";
import type { Automation, AutomationAction, AutomationEvent, Id, Pipeline, Session, Stage, Tag } from "@/lib/types";
import { DUE_OPTIONS, dueLabel } from "./summary";

type Kind = AutomationAction["kind"];
const KINDS: Kind[] = ["change_responsible", "add_task", "change_stage", "edit_tags"];
const LEAD = "lead";

/** Seçenekleri işaret kutularıyla seçtirir. */
function CheckList({ legend, items, selected, onChange }: { legend: string; items: Array<{ id: Id; name: string }>; selected: Id[]; onChange: (next: Id[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="pb-1 text-sm font-medium text-fg">{legend}</legend>
      <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm text-fg hover:bg-surface">
              <Checkbox
                checked={selected.includes(item.id)}
                onCheckedChange={(checked) => onChange(checked === true ? [...selected, item.id] : selected.filter((id) => id !== item.id))}
              />
              {item.name}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function AutomationForm({
  ws,
  session,
  pipeline,
  stage,
  automation,
  tags,
  onDone,
}: {
  ws: string;
  session: Session;
  pipeline: Pipeline;
  stage: Stage;
  automation?: Automation;
  tags: Tag[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const create = useCreateAutomation(ws);
  const update = useUpdateAutomation(ws);
  const a = t.automations;
  // Gelen talepler aşamasına lead taşınamaz; orada yalnız "oluşturuldu" olayı anlamlıdır.
  const events: AutomationEvent[] = stage.kind === "incoming" ? ["lead_created"] : ["lead_created", "stage_entered"];
  const targets = pipeline.stages.filter((item) => item.kind !== "incoming" && item.id !== stage.id).sort((x, y) => x.sort - y.sort);
  const current = automation;

  const [onEvent, setOnEvent] = useState<AutomationEvent>(current?.onEvent ?? "lead_created");
  const [kind, setKind] = useState<Kind>(current?.kind ?? "change_responsible");
  const [mode, setMode] = useState<"user" | "round_robin">(current?.kind === "change_responsible" ? current.settings.mode : "round_robin");
  const [userId, setUserId] = useState<Id>(current?.kind === "change_responsible" && current.settings.mode === "user" ? current.settings.userId : session.user.id);
  const [userIds, setUserIds] = useState<Id[]>(
    current?.kind === "change_responsible" && current.settings.mode === "round_robin" ? current.settings.userIds : session.users.map((user) => user.id),
  );
  const task = current?.kind === "add_task" ? current.settings : null;
  const [typeId, setTypeId] = useState<Id>(task?.typeId ?? session.taskTypes[0]?.id ?? "");
  const [text, setText] = useState(task?.text ?? "");
  const [due, setDue] = useState(String(task?.dueInMinutes ?? 1440));
  const [responsible, setResponsible] = useState<string>(task?.responsible ?? LEAD);
  const [targetId, setTargetId] = useState<Id>(current?.kind === "change_stage" ? current.settings.stageId : (targets[0]?.id ?? ""));
  const [add, setAdd] = useState<Id[]>(current?.kind === "edit_tags" ? current.settings.add : []);
  const [remove, setRemove] = useState<Id[]>(current?.kind === "edit_tags" ? current.settings.remove : []);
  const [error, setError] = useState<string | null>(null);

  function action(): AutomationAction | string {
    switch (kind) {
      case "change_responsible":
        if (mode === "user") return { kind, settings: { mode, userId } };
        // Sıra, ekip listesindeki sıradır.
        return userIds.length === 0 ? a.usersRequired : { kind, settings: { mode, userIds: session.users.filter((user) => userIds.includes(user.id)).map((user) => user.id) } };
      case "add_task":
        return { kind, settings: { typeId, text: text.trim(), dueInMinutes: Number(due), responsible } };
      case "change_stage":
        return targetId ? { kind, settings: { stageId: targetId } } : a.targetRequired;
      case "edit_tags":
        return add.length + remove.length === 0 ? a.tagsRequired : { kind, settings: { add, remove } };
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const built = action();
    if (typeof built === "string") {
      setError(built);
      return;
    }
    setError(null);
    const input = { stageId: stage.id, onEvent, ...built };
    const options = { onSuccess: onDone, onError: (problem: unknown) => setError(errorText(problem, t)) };
    if (current) update.mutate({ id: current.id, ...input, isActive: current.isActive }, options);
    else create.mutate(input, options);
  }

  const dueOptions = [...new Set([...DUE_OPTIONS, Number(due)])].sort((x, y) => x - y);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {error}
        </Notice>
      ) : null}

      <Field id="automation-event" label={a.when}>
        <Select
          id="automation-event"
          value={onEvent}
          onValueChange={(next) => setOnEvent(next as AutomationEvent)}
          options={events.map((item) => ({ value: item, label: a.events[item] }))}
        />
      </Field>
      <Field id="automation-kind" label={a.action}>
        <Select id="automation-kind" value={kind} onValueChange={(next) => setKind(next as Kind)} options={KINDS.map((item) => ({ value: item, label: a.kinds[item] }))} />
      </Field>

      {kind === "change_responsible" ? (
        <>
          <div role="group" aria-label={a.mode} className="flex gap-1">
            <ToggleButton pressed={mode === "round_robin"} onClick={() => setMode("round_robin")}>
              {a.modeRoundRobin}
            </ToggleButton>
            <ToggleButton pressed={mode === "user"} onClick={() => setMode("user")}>
              {a.modeUser}
            </ToggleButton>
          </div>
          {mode === "user" ? (
            <Field id="automation-user" label={a.user}>
              <Select id="automation-user" value={userId} onValueChange={setUserId} options={session.users.map((user) => ({ value: user.id, label: user.name }))} />
            </Field>
          ) : (
            <div className="flex flex-col gap-1">
              <CheckList legend={a.users} items={session.users} selected={userIds} onChange={setUserIds} />
              <p className="text-xs text-muted">{a.usersHint}</p>
            </div>
          )}
        </>
      ) : null}

      {kind === "add_task" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="automation-task-type" label={a.taskType}>
              <Select id="automation-task-type" value={typeId} onValueChange={setTypeId} options={session.taskTypes.map((type) => ({ value: type.id, label: type.name }))} />
            </Field>
            <Field id="automation-task-due" label={a.taskDue}>
              <Select id="automation-task-due" value={due} onValueChange={setDue} options={dueOptions.map((minutes) => ({ value: String(minutes), label: dueLabel(minutes, t) }))} />
            </Field>
          </div>
          <Field id="automation-task-text" label={a.taskText}>
            <Input id="automation-task-text" value={text} onChange={(event) => setText(event.target.value)} placeholder={t.tasks.textPlaceholder} maxLength={2000} />
          </Field>
          <Field id="automation-task-responsible" label={a.taskResponsible}>
            <Select
              id="automation-task-responsible"
              value={responsible}
              onValueChange={setResponsible}
              options={[{ value: LEAD, label: a.leadResponsible }, ...session.users.map((user) => ({ value: user.id, label: user.name }))]}
            />
          </Field>
        </>
      ) : null}

      {kind === "change_stage" ? (
        <Field id="automation-target" label={a.targetStage}>
          <Select
            id="automation-target"
            value={targetId}
            onValueChange={setTargetId}
            options={targets.map((item) => ({ value: item.id, label: item.name, swatch: `--stage-${item.color}` }))}
          />
        </Field>
      ) : null}

      {kind === "edit_tags" ? (
        tags.length === 0 ? (
          <p className="text-sm text-muted">{a.noTags}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <CheckList legend={a.tagsAdd} items={tags} selected={add} onChange={(next) => (setAdd(next), setRemove(remove.filter((id) => !next.includes(id))))} />
            <CheckList legend={a.tagsRemove} items={tags} selected={remove} onChange={(next) => (setRemove(next), setAdd(add.filter((id) => !next.includes(id))))} />
          </div>
        )
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending || update.isPending}>
          {current ? t.common.save : a.submit}
        </Button>
      </div>
    </form>
  );
}

/** Tetikleyici ekleme ve düzenleme penceresi. Aşama sabittir: tetikleyici, eklendiği aşamaya aittir. */
export function AutomationDialog({
  ws,
  session,
  pipeline,
  stage,
  automation,
  tags,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  session: Session;
  pipeline: Pipeline;
  stage: Stage;
  automation?: Automation;
  tags: Tag[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={automation ? t.automations.editTitle : t.automations.newTitle}
      description={fill(t.automations.stageLine, { stage: stage.name })}
      closeLabel={t.common.close}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
    >
      <AutomationForm ws={ws} session={session} pipeline={pipeline} stage={stage} automation={automation} tags={tags} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
