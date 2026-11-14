"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { NameInput } from "@/components/ui/name-input";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateField, useDeleteField, useFields, useOptimisticOrder, useReorderFields, useUpdateField } from "@/lib/hooks";
import type { CustomField, CustomFieldType, EntityType } from "@/lib/types";

const TYPES: CustomFieldType[] = ["text", "numeric", "date", "checkbox", "select", "multiselect", "url"];
const hasOptions = (type: CustomFieldType) => type === "select" || type === "multiselect";
const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Seçenek listesi: her satır bir seçenek. Odaktan çıkınca, değiştiyse kaydeder. */
function OptionsEditor({ field, disabled, onSave }: { field: CustomField; disabled: boolean; onSave: (options: string[]) => void }) {
  const { t } = useI18n();
  const saved = field.options.map((option) => option.label).join("\n");
  const [draft, setDraft] = useState(saved);
  const id = `options-${field.id}`;
  return (
    <div className="flex flex-col gap-1 pl-8">
      <label htmlFor={id} className="sr-only">
        {fill(t.fields.optionsOf, { name: field.name })}
      </label>
      <Textarea
        id={id}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = lines(draft);
          if (next.join("\n") !== saved) onSave(next);
        }}
        aria-describedby={`${id}-hint`}
        rows={Math.min(6, Math.max(3, field.options.length + 1))}
        className="min-h-0"
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        {t.fields.optionsHint}
      </p>
    </div>
  );
}

function FieldsBody({ ws, entityType, canEdit }: { ws: string; entityType: EntityType; canEdit: boolean }) {
  const { t } = useI18n();
  const fields = useFields(ws, entityType);
  const createField = useCreateField(ws);
  const updateField = useUpdateField(ws);
  const reorder = useReorderFields(ws, entityType);
  const deleteField = useDeleteField(ws);

  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CustomFieldType>("text");
  const [newOptions, setNewOptions] = useState("");

  const ordering = useOptimisticOrder(fields.data ?? [], (ids) => reorder.mutateAsync(ids));
  const list = ordering.shown;
  const busy = createField.isPending || updateField.isPending || reorder.isPending || deleteField.isPending;
  const locked = !canEdit || busy;
  const fail = (error: unknown) => setProblem(errorText(error, t));
  const options = { onError: fail, onSuccess: () => setProblem(null) };
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

  function add(event: FormEvent) {
    event.preventDefault();
    if (newName.trim() === "") return;
    createField.mutate(
      { entityType, name: newName, type: newType, options: hasOptions(newType) ? lines(newOptions) : undefined },
      {
        onError: fail,
        onSuccess: () => {
          setProblem(null);
          setNewName("");
          setNewOptions("");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {!canEdit ? <Notice tone="info">{t.fields.adminOnly}</Notice> : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}

      {list.length === 0 ? (
        <p className="text-sm text-muted">{t.fields.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {list.map((field, index) => (
            <li key={field.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs text-muted">{index + 1}</span>
                <NameInput
                  key={field.name}
                  value={field.name}
                  label={fill(t.fields.nameOf, { name: field.name })}
                  disabled={locked}
                  onSave={(name) => tracked(updateField.mutateAsync({ fieldId: field.id, name }))}
                />
                <Badge>{t.fields.types[field.type]}</Badge>
                <Button variant="ghost" size="sm" iconOnly aria-disabled={!canEdit || index === 0 || undefined} onClick={() => move(index, -1)} aria-label={fill(t.fields.moveUp, { name: field.name })}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-disabled={!canEdit || index === list.length - 1 || undefined}
                  onClick={() => move(index, 1)}
                  aria-label={fill(t.fields.moveDown, { name: field.name })}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  disabled={locked}
                  onClick={() => setPendingDelete(field.id)}
                  aria-label={fill(t.fields.remove, { name: field.name })}
                  className="text-danger"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {hasOptions(field.type) ? (
                <OptionsEditor
                  key={field.options.map((option) => option.label).join("|")}
                  field={field}
                  disabled={locked}
                  onSave={(next) => updateField.mutate({ fieldId: field.id, options: next }, options)}
                />
              ) : null}
              {pendingDelete === field.id ? (
                <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3">
                  <p className="text-sm text-fg">{fill(t.fields.removeBody, { name: field.name })}</p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
                      {t.common.cancel}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleteField.isPending}
                      onClick={() =>
                        deleteField.mutate(field.id, {
                          onError: fail,
                          onSuccess: () => {
                            setProblem(null);
                            setPendingDelete(null);
                            setAnnouncement(fill(t.fields.removed, { name: field.name }));
                          },
                        })
                      }
                    >
                      {t.fields.removeConfirm}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={add} className="flex flex-col gap-3 border-t pt-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field id="new-field-name" label={t.fields.newName}>
            <Input
              id="new-field-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t.fields.newNamePlaceholder}
              disabled={!canEdit}
              maxLength={120}
            />
          </Field>
          <Field id="new-field-type" label={t.fields.type}>
            <Select
              id="new-field-type"
              value={newType}
              disabled={!canEdit}
              onValueChange={(next) => setNewType(next as CustomFieldType)}
              options={TYPES.map((type) => ({ value: type, label: t.fields.types[type] }))}
            />
          </Field>
        </div>
        {hasOptions(newType) ? (
          <Field id="new-field-options" label={t.fields.newOptions} hint={t.fields.optionsHint}>
            <Textarea
              id="new-field-options"
              value={newOptions}
              onChange={(event) => setNewOptions(event.target.value)}
              aria-describedby="new-field-options-note"
              disabled={!canEdit}
              rows={3}
              className="min-h-0"
            />
          </Field>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" size="sm" icon={<Plus aria-hidden />} loading={createField.isPending} disabled={!canEdit || newName.trim() === ""}>
            {t.fields.add}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Özel alan yönetimi: ekle, adlandır, sırala, seçenekleri düzenle, sil. */
export function FieldsDialog({
  ws,
  entityType,
  open,
  onOpenChange,
  returnFocusTo,
  canEdit,
}: {
  ws: string;
  entityType: EntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={t.fields.manageTitle[entityType]}
      description={t.fields.manageBody}
      closeLabel={t.common.close}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
    >
      <FieldsBody ws={ws} entityType={entityType} canEdit={canEdit} />
    </Dialog>
  );
}
