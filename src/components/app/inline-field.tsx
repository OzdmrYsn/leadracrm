"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { useI18n } from "@/i18n";

/**
 * Satır içi düzenlenebilir alan. Görüntülerken bir düğmedir; seçilince girdiye döner.
 * Enter kaydeder, Esc vazgeçer. validate bir hata metni döndürürse kaydetmez.
 */
export function InlineField({
  label,
  value,
  display,
  onSave,
  validate,
  inputMode,
  strong = false,
}: {
  label: string;
  /** Düzenlemeye açılınca girdide görünecek ham değer. */
  value: string;
  /** Görüntülenen biçimli değer. */
  display: string;
  onSave: (next: string) => Promise<unknown>;
  validate?: (next: string) => string | null;
  inputMode?: "text" | "decimal";
  /** Değeri büyük ve kalın gösterir (ör. lead tutarı). */
  strong?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function commit() {
    if (saving) return;
    if (draft.trim() === value.trim()) {
      setEditing(false);
      return;
    }
    const problem = validate?.(draft) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      setError(t.lead.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        className="group flex w-full flex-col gap-0.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-strong"
      >
        <span className="text-xs text-muted">{label}</span>
        <span className={cn("flex items-center justify-between gap-2 text-fg", strong ? "text-lg font-semibold tabular-nums" : "text-sm")}>
          <span className="min-w-0 break-words">{display}</span>
          <Pencil aria-hidden className="size-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </span>
        <span className="sr-only">{t.lead.editAction}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <label htmlFor={id} className="text-xs text-muted">
        {label}
      </label>
      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit()}
        inputMode={inputMode}
        disabled={saving}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-note`}
        autoFocus
      />
      <p id={`${id}-note`} role={error ? "alert" : undefined} className={error ? "text-xs text-danger" : "text-xs text-muted"}>
        {error ?? t.lead.editHint}
      </p>
    </div>
  );
}
