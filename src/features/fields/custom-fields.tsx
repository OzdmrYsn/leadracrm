"use client";

import { useRef, useState } from "react";
import { ChevronDown, ExternalLink, Settings2 } from "lucide-react";
import { InlineField } from "@/components/app/inline-field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Checkbox, Switch } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { useFields } from "@/lib/hooks";
import { createSerial } from "@/lib/serial";
import type { CustomField, CustomValue, CustomValues, EntityType } from "@/lib/types";
import { FieldsDialog } from "./fields-dialog";

const NONE = "none";

type ValueProps = {
  field: CustomField;
  value: CustomValue | undefined;
  locale: string;
  /** null alanı boşaltır. */
  onSave: (value: CustomValue) => Promise<unknown>;
};

function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Bir özel alanın değeri, türüne uygun denetimle. */
function FieldValue({ field, value, locale, onSave }: ValueProps) {
  const { t } = useI18n();
  const id = `field-${field.id}`;
  const quiet = (work: Promise<unknown>) => void work.catch(() => undefined);

  if (field.type === "text" || field.type === "url") {
    const text = typeof value === "string" ? value : "";
    const editor = (
      <InlineField
        label={field.name}
        value={text}
        display={text || t.common.none}
        validate={(next) => (field.type === "url" && next.trim() !== "" && !/^https?:\/\/\S+$/i.test(next.trim()) ? t.fields.urlInvalid : null)}
        onSave={(next) => onSave(next.trim() === "" ? null : next.trim())}
      />
    );
    if (field.type !== "url" || text === "") return editor;
    // Değer kaydedilirken http(s) olarak doğrulanır; bağlantı yeni sekmede açılır.
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{editor}</div>
        <a
          href={text}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={fill(t.fields.openLink, { name: field.name })}
          title={fill(t.fields.openLink, { name: field.name })}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-strong hover:text-fg"
        >
          <ExternalLink aria-hidden className="size-4" />
        </a>
      </div>
    );
  }

  if (field.type === "numeric") {
    const number = typeof value === "number" ? value : null;
    return (
      <InlineField
        label={field.name}
        value={number === null ? "" : String(number).replace(".", ",")}
        display={number === null ? t.common.none : new Intl.NumberFormat(locale).format(number)}
        inputMode="decimal"
        validate={(next) => (next.trim() !== "" && parseNumber(next) === null ? t.fields.numberInvalid : null)}
        onSave={(next) => onSave(next.trim() === "" ? null : parseNumber(next))}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center justify-between gap-3 px-2 py-1 text-sm text-fg">
        {field.name}
        <Switch checked={value === true} onCheckedChange={(checked) => quiet(onSave(checked))} />
      </label>
    );
  }

  if (field.type === "date") {
    return (
      <div className="flex flex-col gap-1 px-2 py-1">
        <label htmlFor={id} className="text-xs text-muted">
          {field.name}
        </label>
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => quiet(onSave(event.target.value === "" ? null : event.target.value))}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="flex flex-col gap-1 px-2 py-1">
        <label htmlFor={id} className="text-xs text-muted">
          {field.name}
        </label>
        <Select
          id={id}
          value={typeof value === "string" ? value : NONE}
          onValueChange={(next) => quiet(onSave(next === NONE ? null : next))}
          options={[{ value: NONE, label: t.fields.notSet }, ...field.options.map((option) => ({ value: option.id, label: option.label }))]}
        />
      </div>
    );
  }

  return <MultiSelectValue field={field} value={value} onSave={onSave} />;
}

/**
 * Çoklu seçim. Seçim ekranda tutulur ve her değişiklikte kaydedilir; böylece art arda iki işaretleme,
 * ilkinin kaydı bitmeden yapılsa da birbirini ezmez. Kayıtlar sırayla gider; sonuncusu bitince sunucudaki değer gösterilir.
 */
function MultiSelectValue({ field, value, onSave }: Omit<ValueProps, "locale">) {
  const { t } = useI18n();
  const id = `field-${field.id}`;
  const [draft, setDraft] = useState<string[] | null>(null);
  const queue = useRef<ReturnType<typeof createSerial> | null>(null);
  const selected = draft ?? (Array.isArray(value) ? value : []);
  const labels = field.options.filter((option) => selected.includes(option.id)).map((option) => option.label);

  function toggle(optionId: string, checked: boolean) {
    const next = checked ? [...selected.filter((item) => item !== optionId), optionId] : selected.filter((item) => item !== optionId);
    setDraft(next);
    queue.current ??= createSerial();
    queue.current.run(
      () => onSave(next.length > 0 ? next : null).catch(() => undefined),
      () => setDraft(null),
    );
  }

  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <span id={`${id}-label`} className="text-xs text-muted">
        {field.name}
      </span>
      <Popover
        label={field.name}
        trigger={
          <button
            type="button"
            aria-label={fill(t.fields.choose, { name: field.name })}
            aria-describedby={`${id}-label`}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-border-input bg-bg px-3 py-2 text-left text-sm text-fg transition-colors hover:border-fg"
          >
            <span className={labels.length > 0 ? "min-w-0 break-words" : "text-muted"}>{labels.length > 0 ? labels.join(", ") : t.fields.notSet}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
          </button>
        }
      >
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {field.options.map((option) => (
            <li key={option.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm text-fg hover:bg-surface">
                <Checkbox checked={selected.includes(option.id)} onCheckedChange={(checked) => toggle(option.id, checked === true)} />
                {option.label}
              </label>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}

export function CustomFields({
  ws,
  entityType,
  values,
  locale,
  canManage,
  onSave,
}: {
  ws: string;
  entityType: EntityType;
  values: CustomValues;
  locale: string;
  canManage: boolean;
  /** Yalnız değişen alanlar gönderilir. */
  onSave: (patch: CustomValues) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const fields = useFields(ws, entityType);
  const [managing, setManaging] = useState(false);
  const manageRef = useRef<HTMLButtonElement>(null);

  return (
    <section aria-label={t.fields.title} className="flex flex-col gap-1 border-t pt-2">
      <div className="flex min-h-8 items-center justify-between gap-2 px-2">
        <h2 className="text-xs font-medium text-muted">{t.fields.title}</h2>
        {canManage ? (
          <Button ref={manageRef} variant="ghost" size="sm" icon={<Settings2 aria-hidden />} onClick={() => setManaging(true)}>
            {t.fields.manage}
          </Button>
        ) : null}
      </div>
      {fields.isPending ? (
        <div aria-busy className="flex flex-col gap-2 px-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : (fields.data ?? []).length === 0 ? (
        <p className="px-2 pb-2 text-sm text-muted">{t.fields.empty}</p>
      ) : (
        (fields.data ?? []).map((field) => (
          <FieldValue key={field.id} field={field} value={values[field.id]} locale={locale} onSave={(value) => onSave({ [field.id]: value })} />
        ))
      )}
      <FieldsDialog ws={ws} entityType={entityType} open={managing} onOpenChange={setManaging} returnFocusTo={manageRef} canEdit={canManage} />
    </section>
  );
}
