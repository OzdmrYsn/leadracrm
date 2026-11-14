"use client";

import { useId, useState, type FormEvent, type RefObject } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Tag as TagChip, type StageColor } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "@/lib/hooks";

function TagsBody({ ws, canEdit }: { ws: string; canEdit: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const tags = useTags(ws);
  const create = useCreateTag(ws);
  const update = useUpdateTag(ws);
  const remove = useDeleteTag(ws);
  const [name, setName] = useState("");
  const [color, setColor] = useState<StageColor | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fail = (error: unknown) => setProblem(errorText(error, t));
  const list = tags.data ?? [];

  function add(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate(
      { name, color: color ?? undefined },
      {
        onError: fail,
        onSuccess: () => {
          setProblem(null);
          setName("");
          setColor(null);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {!canEdit ? <Notice tone="info">{t.tags.adminOnly}</Notice> : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {list.length === 0 ? (
        <p className="text-sm text-muted">{tags.isPending ? t.common.loading : t.tags.manageNone}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((tag) => (
            <li key={tag.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 flex-1">
                  <TagChip color={tag.color}>{tag.name}</TagChip>
                </span>
                <span className="shrink-0 text-xs text-muted">{fill(t.tags.usage, { count: tag.count ?? 0 })}</span>
                {canEdit ? (
                  <>
                    <ColorSwatches
                      value={tag.color ?? null}
                      onValueChange={(next) => update.mutate({ id: tag.id, color: next }, { onError: fail, onSuccess: () => setProblem(null) })}
                      label={fill(t.tags.colorOf, { name: tag.name })}
                      names={t.colors}
                      noneLabel={t.colors.none}
                    />
                    <Button variant="ghost" size="sm" iconOnly aria-label={fill(t.tags.delete, { name: tag.name })} onClick={() => setPendingDelete(tag.id)} className="text-danger">
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                ) : null}
              </div>
              {pendingDelete === tag.id ? (
                <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3">
                  <p className="text-sm text-fg">{fill(t.tags.deleteBody, { name: tag.name, count: tag.count ?? 0 })}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
                      {t.common.cancel}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={remove.isPending}
                      onClick={() =>
                        remove.mutate(tag.id, {
                          onError: fail,
                          onSuccess: () => {
                            setProblem(null);
                            setPendingDelete(null);
                            setAnnouncement(fill(t.tags.deleted, { name: tag.name }));
                          },
                        })
                      }
                    >
                      {t.tags.deleteConfirm}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-3 border-t pt-3">
        <Field id={`${id}-name`} label={t.tags.newName}>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} placeholder={t.tags.newPlaceholder} maxLength={60} />
        </Field>
        <ColorSwatches value={color} onValueChange={setColor} label={t.tags.color} names={t.colors} noneLabel={t.colors.none} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" icon={<Plus aria-hidden />} loading={create.isPending} disabled={name.trim() === ""}>
            {t.tags.add}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Etiket yönetimi: kullanım sayısı, renk, silme ve yeni etiket. Renk ve silme yalnız yöneticide. */
export function TagsDialog({
  ws,
  canEdit,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={t.tags.manageTitle} description={t.tags.manageBody} closeLabel={t.common.close} open={open} onOpenChange={onOpenChange} returnFocusTo={returnFocusTo}>
      <TagsBody ws={ws} canEdit={canEdit} />
    </Dialog>
  );
}
