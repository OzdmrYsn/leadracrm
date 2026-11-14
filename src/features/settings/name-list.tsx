"use client";

import { useId, useState, type FormEvent } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { NameInput } from "@/components/ui/name-input";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";

type Labels = { title: string; body: string; none: string; newName: string; newPlaceholder: string; add: string; nameOf: string; remove: string; removeBody: string; removeConfirm: string; removed: string };

/** Adlardan oluşan kısa bir liste için ayar bölümü: ekle, yerinde adlandır, onaylayarak sil. */
export function NameList({
  labels,
  items,
  canEdit,
  maxLength,
  onCreate,
  onRename,
  onDelete,
}: {
  labels: Labels;
  items: Array<{ id: string; name: string }>;
  canEdit: boolean;
  maxLength: number;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"add" | "delete" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fail = (error: unknown) => setProblem(errorText(error, t));

  function add(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    setBusy("add");
    onCreate(name)
      .then(() => {
        setProblem(null);
        setName("");
      }, fail)
      .finally(() => setBusy(null));
  }

  return (
    <section aria-labelledby={headingId} className="flex max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-fg">
          {labels.title}
        </h2>
        <p className="text-sm text-muted">{labels.body}</p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted">{labels.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <NameInput
                    key={item.name}
                    value={item.name}
                    label={fill(labels.nameOf, { name: item.name })}
                    onSave={(next) =>
                      onRename(item.id, next).then(
                        () => setProblem(null),
                        (error: unknown) => {
                          fail(error);
                          throw error;
                        },
                      )
                    }
                  />
                ) : (
                  <span className="min-w-0 flex-1 text-sm break-words text-fg">{item.name}</span>
                )}
                {canEdit ? (
                  <Button variant="ghost" size="sm" iconOnly aria-label={fill(labels.remove, { name: item.name })} onClick={() => setPendingDelete(item.id)} className="text-danger">
                    <Trash2 aria-hidden />
                  </Button>
                ) : null}
              </div>
              {pendingDelete === item.id ? (
                <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3">
                  <p className="text-sm text-fg">{fill(labels.removeBody, { name: item.name })}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
                      {t.common.cancel}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busy === "delete"}
                      onClick={() => {
                        setBusy("delete");
                        onDelete(item.id)
                          .then(() => {
                            setProblem(null);
                            setPendingDelete(null);
                            setAnnouncement(fill(labels.removed, { name: item.name }));
                          }, fail)
                          .finally(() => setBusy(null));
                      }}
                    >
                      {labels.removeConfirm}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field id={`${headingId}-new`} label={labels.newName}>
              <Input id={`${headingId}-new`} value={name} onChange={(event) => setName(event.target.value)} placeholder={labels.newPlaceholder} maxLength={maxLength} />
            </Field>
          </div>
          <Button type="submit" icon={<Plus aria-hidden />} loading={busy === "add"} disabled={name.trim() === ""}>
            {labels.add}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
