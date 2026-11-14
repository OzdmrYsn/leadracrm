"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowRightLeft, Tags, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Tag as TagChip } from "@/components/ui/tag";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useBulkLeads, useTags } from "@/lib/hooks";
import type { BulkAction, BulkResult, Id, Session, Tag } from "@/lib/types";

type Mode = BulkAction["kind"];
const UNASSIGNED = "none";

function TagChoices({ legend, tags, chosen, blocked, onToggle }: { legend: string; tags: Tag[]; chosen: Id[]; blocked: Id[]; onToggle: (id: Id, on: boolean) => void }) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-fg">{legend}</legend>
      {tags.map((tag) => (
        <div key={tag.id} className="flex min-h-6 items-center gap-2">
          <Checkbox
            id={`${id}-${tag.id}`}
            checked={chosen.includes(tag.id)}
            // Aynı etiket hem eklenip hem kaldırılamaz.
            disabled={blocked.includes(tag.id)}
            onCheckedChange={(checked) => onToggle(tag.id, checked === true)}
          />
          <label htmlFor={`${id}-${tag.id}`} className="min-w-0">
            <TagChip color={tag.color ?? undefined}>{tag.name}</TagChip>
          </label>
        </div>
      ))}
    </fieldset>
  );
}

/**
 * Seçili lead'ler için araç çubuğu: sorumlu, aşama, etiket, silme. İşlem bir pencerede onaylanır;
 * uygulanamayan lead'ler (yetki yok, başka pipeline) atlanır ve sonuç üst bileşene bildirilir.
 */
export function BulkBar({
  ws,
  session,
  ids,
  onClear,
  onDone,
}: {
  ws: string;
  session: Session;
  ids: Id[];
  onClear: () => void;
  onDone: (mode: Mode, result: BulkResult) => void;
}) {
  const { t } = useI18n();
  const formId = useId();
  const bulk = useBulkLeads(ws);
  const tags = useTags(ws);
  const [mode, setMode] = useState<Mode | null>(null);
  const [userId, setUserId] = useState(session.user.id);
  const [stageId, setStageId] = useState("");
  const [add, setAdd] = useState<Id[]>([]);
  const [remove, setRemove] = useState<Id[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const count = ids.length;

  const several = session.pipelines.length > 1;
  const stageOptions = session.pipelines.flatMap((pipeline) =>
    pipeline.stages
      .filter((stage) => stage.kind !== "incoming")
      .sort((a, b) => a.sort - b.sort)
      .map((stage) => ({ value: stage.id, label: several ? `${pipeline.name} › ${stage.name}` : stage.name, swatch: `--stage-${stage.color}` })),
  );

  function open(next: Mode, element: HTMLElement) {
    trigger.current = element;
    setProblem(null);
    setAdd([]);
    setRemove([]);
    setMode(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode) return;
    let action: BulkAction;
    if (mode === "responsible") action = { kind: "responsible", userId: userId === UNASSIGNED ? null : userId };
    else if (mode === "stage") {
      if (!stageId) return;
      action = { kind: "stage", stageId };
    } else if (mode === "tags") {
      if (add.length + remove.length === 0) {
        setProblem(t.bulk.nothingChosen);
        return;
      }
      action = { kind: "tags", add, remove };
    } else action = { kind: "delete" };
    setProblem(null);
    // mutateAsync: silme gibi işlemlerde seçili satırlar listeden kalkar ve bu çubuk ekrandan çıkar;
    // mutate'in çağrıya özel geri çağrıları o durumda çalışmaz, sonuç üst bileşene ulaşmazdı.
    bulk.mutateAsync({ ids, action }).then(
      (result) => {
        setMode(null);
        onDone(action.kind, result);
      },
      (error: unknown) => setProblem(errorText(error, t)),
    );
  }

  const toggle = (list: Id[], set: (next: Id[]) => void) => (id: Id, on: boolean) => set(on ? [...list, id] : list.filter((item) => item !== id));
  const title =
    mode === "responsible" ? t.bulk.responsibleTitle : mode === "stage" ? t.bulk.stageTitle : mode === "tags" ? t.bulk.tagsTitle : fill(t.bulk.deleteTitle, { count });

  return (
    <>
      <div role="toolbar" aria-label={t.bulk.label} className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-accent-soft px-3 py-2">
        <p className="mr-2 text-sm font-medium text-fg">{fill(t.bulk.selected, { count })}</p>
        <Button size="sm" icon={<UserRound aria-hidden />} onClick={(event) => open("responsible", event.currentTarget)}>
          {t.bulk.responsible}
        </Button>
        <Button size="sm" icon={<ArrowRightLeft aria-hidden />} onClick={(event) => open("stage", event.currentTarget)}>
          {t.bulk.stage}
        </Button>
        <Button size="sm" icon={<Tags aria-hidden />} onClick={(event) => open("tags", event.currentTarget)}>
          {t.bulk.tags}
        </Button>
        <Button size="sm" icon={<Trash2 aria-hidden />} onClick={(event) => open("delete", event.currentTarget)} className="text-danger">
          {t.bulk.delete}
        </Button>
        <Button size="sm" variant="ghost" icon={<X aria-hidden />} onClick={onClear}>
          {t.bulk.clear}
        </Button>
      </div>

      <Dialog
        title={title}
        description={mode === "delete" ? t.bulk.deleteBody : fill(t.bulk.body, { count })}
        closeLabel={t.common.close}
        open={mode !== null}
        onOpenChange={(next) => {
          if (!next) setMode(null);
        }}
        returnFocusTo={trigger}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode(null)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={formId} variant={mode === "delete" ? "danger" : "primary"} loading={bulk.isPending} disabled={mode === "stage" && !stageId}>
              {mode === "delete" ? t.bulk.deleteConfirm : t.bulk.apply}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4">
          {problem ? (
            <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
              {problem}
            </Notice>
          ) : null}
          {mode === "responsible" ? (
            <Field id={`${formId}-user`} label={t.bulk.newResponsible}>
              <Select
                id={`${formId}-user`}
                value={userId}
                onValueChange={setUserId}
                options={[{ value: UNASSIGNED, label: t.common.unassigned }, ...session.users.map((user) => ({ value: user.id, label: user.name }))]}
              />
            </Field>
          ) : null}
          {mode === "stage" ? (
            <Field id={`${formId}-stage`} label={t.bulk.newStage} hint={several ? t.bulk.stageHint : undefined}>
              <Select
                id={`${formId}-stage`}
                value={stageId}
                onValueChange={setStageId}
                options={stageOptions}
                placeholder={t.common.none}
                aria-describedby={several ? `${formId}-stage-note` : undefined}
              />
            </Field>
          ) : null}
          {mode === "tags" ? (
            (tags.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">{tags.isPending ? t.common.loading : t.bulk.noTags}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <TagChoices legend={t.bulk.addTags} tags={tags.data ?? []} chosen={add} blocked={remove} onToggle={toggle(add, setAdd)} />
                <TagChoices legend={t.bulk.removeTags} tags={tags.data ?? []} chosen={remove} blocked={add} onToggle={toggle(remove, setRemove)} />
              </div>
            )
          ) : null}
        </form>
      </Dialog>
    </>
  );
}
