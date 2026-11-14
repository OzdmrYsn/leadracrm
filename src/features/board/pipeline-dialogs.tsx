"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { NameInput } from "@/components/ui/name-input";
import { Dialog, Popover } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Badge, type StageColor } from "@/components/ui/tag";
import { Switch } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import {
  useBoard,
  useCreatePipeline,
  useCreateStage,
  useDeleteStage,
  useOptimisticOrder,
  useReorderStages,
  useUpdatePipeline,
  useUpdateStage,
} from "@/lib/hooks";
import type { Id, Pipeline, Session, Stage } from "@/lib/types";

/* ---------- Yeni pipeline ---------- */

function NewPipelineForm({ ws, onDone, onCreated }: { ws: string; onDone: () => void; onCreated: (pipelineId: Id) => void }) {
  const { t } = useI18n();
  const create = useCreatePipeline(ws);
  const [name, setName] = useState("");
  const [error, setError] = useState<{ name?: string; form?: string }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError({ name: t.pipeline.nameRequired });
      return;
    }
    setError({});
    const defaults = t.pipeline.defaultStages;
    create.mutate(
      { name, stageNames: { incoming: defaults.incoming, open: [...defaults.open], won: defaults.won, lost: defaults.lost } },
      {
        onSuccess: (pipeline) => {
          onCreated(pipeline.id);
          onDone();
        },
        onError: (problem) => setError({ form: errorText(problem, t) }),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error.form ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {error.form}
        </Notice>
      ) : null}
      <Field id="new-pipeline-name" label={t.pipeline.name} required error={error.name}>
        <Input
          id="new-pipeline-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error.name ? true : undefined}
          aria-describedby={error.name ? "new-pipeline-name-note" : undefined}
          maxLength={100}
          required
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t.pipeline.createSubmit}
        </Button>
      </div>
    </form>
  );
}

export function NewPipelineDialog({
  ws,
  open,
  onOpenChange,
  onCreated,
  returnFocusTo,
}: {
  ws: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (pipelineId: Id) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={t.pipeline.create}
      description={t.pipeline.createBody}
      closeLabel={t.common.close}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
    >
      <NewPipelineForm ws={ws} onDone={() => onOpenChange(false)} onCreated={onCreated} />
    </Dialog>
  );
}

/* ---------- Pipeline düzenleme ---------- */

function ColorButton({ stage, disabled, onPick }: { stage: Stage; disabled?: boolean; onPick: (color: StageColor) => void }) {
  const { t } = useI18n();
  return (
    <Popover
      label={fill(t.pipeline.stageColor, { name: stage.name })}
      className="w-auto"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label={fill(t.pipeline.stageColor, { name: stage.name })}
          className="size-6 shrink-0 rounded-pill border border-border-input disabled:opacity-50"
          style={{ background: `var(--stage-${stage.color})` }}
        />
      }
    >
      <ColorSwatches
        value={stage.color}
        onValueChange={(color) => color && onPick(color)}
        label={fill(t.pipeline.stageColor, { name: stage.name })}
        names={t.colors}
      />
    </Popover>
  );
}

function EditPipelineBody({ ws, pipeline, canEdit }: { ws: string; pipeline: Pipeline; canEdit: boolean }) {
  const { t } = useI18n();
  const board = useBoard(ws, pipeline.id);
  const updatePipeline = useUpdatePipeline(ws, pipeline.id);
  const createStage = useCreateStage(ws, pipeline.id);
  const updateStage = useUpdateStage(ws);
  const reorder = useReorderStages(ws, pipeline.id);
  const deleteStage = useDeleteStage(ws);

  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Stage | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");

  const sorted = pipeline.stages.slice().sort((a, b) => a.sort - b.sort);
  const ordering = useOptimisticOrder(
    sorted.filter((stage) => stage.kind === "open"),
    (ids) => reorder.mutateAsync(ids),
  );
  const open = ordering.shown;
  const incoming = sorted.find((stage) => stage.kind === "incoming");
  const closing = sorted.filter((stage) => stage.kind === "won" || stage.kind === "lost");
  const counts = new Map((board.data?.columns ?? []).map((column) => [column.stage.id, column.count]));
  const busy = updatePipeline.isPending || createStage.isPending || updateStage.isPending || reorder.isPending || deleteStage.isPending;
  const locked = !canEdit || busy;

  const fail = (error: unknown) => setProblem(errorText(error, t));
  const options = { onError: fail, onSuccess: () => setProblem(null) };
  /** Ad alanları için: sonucu bildirir ve hatayı çağırana geri verir. */
  const tracked = <T,>(work: Promise<T>): Promise<T> =>
    work.then(
      (result) => {
        setProblem(null);
        return result;
      },
      (error: unknown) => {
        fail(error);
        throw error;
      },
    );

  /**
   * Taşıma düğmeleri odağı kaybetmesin diye disabled değil aria-disabled kullanır. Başka bir kayıt sürerken de
   * çalışır: sıra ekranda hemen değişir, art arda basışlar kaybolmaz.
   */
  function move(index: number, delta: -1 | 1) {
    if (!canEdit) return;
    setProblem(null);
    ordering.move(index, delta, fail);
  }

  function askDelete(stage: Stage) {
    setProblem(null);
    if ((counts.get(stage.id) ?? 0) === 0) {
      removeStage(stage, undefined);
      return;
    }
    setPendingDelete(stage);
    setMoveTo(open.find((item) => item.id !== stage.id)?.id ?? "");
  }

  function removeStage(stage: Stage, target: Id | undefined) {
    deleteStage.mutate(
      { stageId: stage.id, moveTo: target },
      {
        onError: fail,
        onSuccess: () => {
          setProblem(null);
          setPendingDelete(null);
          setAnnouncement(fill(t.pipeline.stageDeleted, { name: stage.name }));
        },
      },
    );
  }

  function addStage(event: FormEvent) {
    event.preventDefault();
    if (newName.trim() === "") return;
    // Yeni aşamaya, kullanılmayan ilk palet rengi verilir.
    const used = new Set(open.map((stage) => stage.color));
    const color = (([1, 2, 3, 5, 7, 4, 6, 8] as StageColor[]).find((item) => !used.has(item)) ?? 1) as StageColor;
    createStage.mutate({ name: newName, color }, { onError: fail, onSuccess: () => (setProblem(null), setNewName("")) });
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {!canEdit ? <Notice tone="info">{t.pipeline.adminOnly}</Notice> : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">{t.pipeline.name}</span>
        <NameInput
          key={pipeline.name}
          value={pipeline.name}
          label={t.pipeline.name}
          disabled={locked}
          onSave={(name) => tracked(updatePipeline.mutateAsync({ name }))}
          className="h-10 w-full"
        />
      </div>

      <label className="flex items-start justify-between gap-4">
        <span className="flex flex-col">
          <span className="text-sm font-medium text-fg">{t.pipeline.incomingToggle}</span>
          <span className="text-xs text-muted">{t.pipeline.incomingHint}</span>
        </span>
        <Switch
          checked={pipeline.incomingEnabled}
          disabled={locked}
          onCheckedChange={(incomingEnabled) => updatePipeline.mutate({ incomingEnabled }, options)}
        />
      </label>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-fg">{t.pipeline.stages}</h3>
        <ol className="flex flex-col gap-2">
          {incoming && pipeline.incomingEnabled ? (
            <li className="flex h-8 items-center gap-2">
              <span aria-hidden className="size-6 shrink-0 rounded-pill border border-border-input" style={{ background: `var(--stage-${incoming.color})` }} />
              <span className="min-w-0 flex-1 truncate px-3 text-sm text-muted">{incoming.name}</span>
              <Badge>{t.pipeline.system}</Badge>
            </li>
          ) : null}

          {open.map((stage, index) => (
            <li key={stage.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ColorButton stage={stage} disabled={locked} onPick={(color) => updateStage.mutate({ stageId: stage.id, color }, options)} />
                <NameInput
                  key={stage.name}
                  value={stage.name}
                  label={fill(t.pipeline.stageName, { name: stage.name })}
                  disabled={locked}
                  onSave={(name) => tracked(updateStage.mutateAsync({ stageId: stage.id, name }))}
                />
                <Button variant="ghost" size="sm" iconOnly aria-disabled={!canEdit || index === 0 || undefined} onClick={() => move(index, -1)} aria-label={fill(t.pipeline.moveUp, { name: stage.name })}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-disabled={!canEdit || index === open.length - 1 || undefined}
                  onClick={() => move(index, 1)}
                  aria-label={fill(t.pipeline.moveDown, { name: stage.name })}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  disabled={locked || open.length <= 1}
                  onClick={() => askDelete(stage)}
                  aria-label={fill(t.pipeline.deleteStage, { name: stage.name })}
                  className="text-danger"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {pendingDelete?.id === stage.id ? (
                <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3">
                  <p className="text-sm text-fg">{fill(t.pipeline.deleteMoveBody, { name: stage.name, count: counts.get(stage.id) ?? 0 })}</p>
                  <Field id={`move-to-${stage.id}`} label={t.pipeline.moveTo}>
                    <Select
                      id={`move-to-${stage.id}`}
                      value={moveTo}
                      onValueChange={setMoveTo}
                      options={open
                        .filter((item) => item.id !== stage.id)
                        .map((item) => ({ value: item.id, label: item.name, swatch: `--stage-${item.color}` }))}
                    />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
                      {t.common.cancel}
                    </Button>
                    <Button variant="danger" size="sm" loading={deleteStage.isPending} disabled={!moveTo} onClick={() => removeStage(stage, moveTo)}>
                      {t.pipeline.deleteConfirm}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}

          {closing.map((stage) => (
            <li key={stage.id} className="flex items-center gap-2">
              <span aria-hidden className="size-6 shrink-0 rounded-pill border border-border-input" style={{ background: `var(--stage-${stage.color})` }} />
              <NameInput
                key={stage.name}
                value={stage.name}
                label={fill(t.pipeline.stageName, { name: stage.name })}
                disabled={locked}
                onSave={(name) => tracked(updateStage.mutateAsync({ stageId: stage.id, name }))}
              />
              <Badge>{t.pipeline.system}</Badge>
            </li>
          ))}
        </ol>

        <form onSubmit={addStage} className="flex items-center gap-2 border-t pt-3">
          <label htmlFor="new-stage-name" className="sr-only">
            {t.pipeline.newStageLabel}
          </label>
          <Input
            id="new-stage-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t.pipeline.newStagePlaceholder}
            disabled={!canEdit}
            maxLength={100}
            className="h-8 min-w-0 flex-1"
          />
          <Button type="submit" size="sm" icon={<Plus aria-hidden />} loading={createStage.isPending} disabled={!canEdit || newName.trim() === ""}>
            {t.pipeline.addStage}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function EditPipelineDialog({
  ws,
  session,
  pipeline,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  session: Session;
  pipeline: Pipeline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={t.pipeline.edit} closeLabel={t.common.close} open={open} onOpenChange={onOpenChange} returnFocusTo={returnFocusTo}>
      <EditPipelineBody ws={ws} pipeline={pipeline} canEdit={session.user.isAdmin} />
    </Dialog>
  );
}
