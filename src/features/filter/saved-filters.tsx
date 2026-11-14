"use client";

import { useId, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Bookmark, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/overlay";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateSavedFilter, useDeleteSavedFilter, useSavedFilters } from "@/lib/hooks";
import { fromSaved, isFiltered, type LeadFilterState } from "./filter-state";

/** Kayıtlı süzgeçler: uygula, sil, ekrandaki süzgeci adlandırıp kaydet. Süzgeçler kişiseldir. */
export function SavedFilters({
  ws,
  scope,
  value,
  onChange,
}: {
  ws: string;
  scope: "board" | "list";
  value: LeadFilterState;
  onChange: Dispatch<SetStateAction<LeadFilterState>>;
}) {
  const { t } = useI18n();
  const id = useId();
  const saved = useSavedFilters(ws);
  const create = useCreateSavedFilter(ws);
  const remove = useDeleteSavedFilter(ws);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const active = isFiltered(value, scope);
  const fail = (error: unknown) => setProblem(errorText(error, t));

  function save(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "" || !active) return;
    setProblem(null);
    create.mutate({ name, criteria: { ...value } }, { onError: fail, onSuccess: () => setName("") });
  }

  return (
    <Popover
      label={t.saved.panel}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" icon={<Bookmark aria-hidden />}>
          {t.saved.button}
        </Button>
      }
    >
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {(saved.data ?? []).length === 0 ? (
        <p className="text-sm text-muted">{saved.isPending ? t.common.loading : t.saved.none}</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {(saved.data ?? []).map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-label={fill(t.saved.apply, { name: item.name })}
                onClick={() => {
                  // Pano, liste süzgecindeki aşama ve durumu kullanmaz; kayıtlı değer durur ama etkisizdir.
                  onChange(fromSaved(item.criteria));
                  setOpen(false);
                }}
                className="flex min-h-8 min-w-0 flex-1 items-center rounded-sm px-2 text-left text-sm text-fg transition-colors hover:bg-surface"
              >
                <span className="truncate">{item.name}</span>
              </button>
              <Button variant="ghost" size="sm" iconOnly aria-label={fill(t.saved.remove, { name: item.name })} disabled={remove.isPending} onClick={() => remove.mutate(item.id, { onError: fail })}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={save} className="flex flex-col gap-2 border-t pt-3">
        <label htmlFor={`${id}-name`} className="text-sm font-medium text-fg">
          {t.saved.name}
        </label>
        <div className="flex gap-2">
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.saved.placeholder}
            maxLength={80}
            disabled={!active}
            aria-describedby={active ? undefined : `${id}-hint`}
            className="h-8 min-w-0 flex-1"
          />
          <Button type="submit" size="sm" loading={create.isPending} disabled={!active || name.trim() === ""}>
            {t.saved.save}
          </Button>
        </div>
        {active ? null : (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {t.saved.hint}
          </p>
        )}
      </form>
    </Popover>
  );
}
