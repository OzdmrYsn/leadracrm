"use client";

import { useId, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/overlay";
import { useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";

export type PickerItem = { id: string; title: string; subtitle?: string | null };

/**
 * Arayıp seçmeye yarayan açılır panel: kişi, şirket, lead.
 * onPick başarıyla dönünce kapanır. onCreate verilirse, yazılan adla yeni kayıt oluşturup onu seçer.
 */
export function SearchPicker({
  trigger,
  label,
  searchLabel,
  placeholder,
  hint,
  noMatch,
  items,
  loading,
  query,
  onQueryChange,
  open,
  onOpenChange,
  onPick,
  onCreate,
  createLabel,
  locale,
}: {
  trigger: ReactNode;
  /** Panelin okunur adı. */
  label: string;
  searchLabel: string;
  placeholder: string;
  /** Arama boşken ve sonuç yokken gösterilir. */
  hint: string;
  noMatch: string;
  items: PickerItem[];
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string) => Promise<unknown>;
  /** Yazılan adla kayıt oluşturur ve kimliğini döndürür. */
  onCreate?: (name: string) => Promise<string>;
  createLabel?: string;
  locale: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = query.trim();

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onOpenChange(false);
      onQueryChange("");
    } catch (problem) {
      setError(errorText(problem, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover trigger={trigger} label={label} open={open} onOpenChange={onOpenChange}>
      <label htmlFor={id} className="sr-only">
        {searchLabel}
      </label>
      <Input id={id} type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} maxLength={255} />
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {loading ? (
        <Spinner label={t.common.loading} />
      ) : items.length > 0 ? (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => onPick(item.id))}
                className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left transition-colors hover:bg-surface disabled:opacity-50"
              >
                <Avatar name={item.title} size="sm" locale={locale} decorative />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-fg">{item.title}</span>
                  {item.subtitle ? <span className="block truncate text-xs text-muted">{item.subtitle}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{name ? noMatch : hint}</p>
      )}
      {onCreate && name ? (
        <Button size="sm" icon={<Plus aria-hidden />} loading={busy} onClick={() => void run(async () => onPick(await onCreate(name)))}>
          <span className="truncate">{createLabel}</span>
        </Button>
      ) : null}
    </Popover>
  );
}
