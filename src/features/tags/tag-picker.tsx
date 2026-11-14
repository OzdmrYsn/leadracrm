"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/overlay";
import { Tag, type StageColor } from "@/components/ui/tag";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateTag, useTags } from "@/lib/hooks";
import { fold } from "@/lib/text";
import type { Id } from "@/lib/types";

/** Etiket seçici: var olanları işaretler, yazılan ad yoksa yeni etiket oluşturur. */
export function TagPicker({
  ws,
  selectedIds,
  onChange,
  trigger,
}: {
  ws: string;
  selectedIds: Id[];
  onChange: (tagIds: Id[]) => void;
  trigger: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  const tags = useTags(ws);
  const createTag = useCreateTag(ws);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<StageColor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = tags.data ?? [];
  const needle = fold(query);
  const visible = needle ? all.filter((tag) => fold(tag.name).includes(needle)) : all;
  const canCreate = needle.length > 0 && !all.some((tag) => fold(tag.name) === needle);

  function toggle(tagId: Id) {
    onChange(selectedIds.includes(tagId) ? selectedIds.filter((item) => item !== tagId) : [...selectedIds, tagId]);
  }

  async function create() {
    if (!canCreate || createTag.isPending) return;
    setError(null);
    try {
      const tag = await createTag.mutateAsync({ name: query.trim(), color: color ?? undefined });
      onChange([...selectedIds, tag.id]);
      setQuery("");
      setColor(null);
    } catch (problem) {
      setError(errorText(problem, t));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void create();
    }
  }

  return (
    <Popover trigger={trigger} label={t.tags.panel}>
      <label htmlFor={id} className="sr-only">
        {t.tags.searchLabel}
      </label>
      <Input
        id={id}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t.tags.searchPlaceholder}
        maxLength={60}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {visible.map((tag) => (
            <li key={tag.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface">
                <Checkbox checked={selectedIds.includes(tag.id)} onCheckedChange={() => toggle(tag.id)} />
                <Tag color={tag.color}>{tag.name}</Tag>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{needle ? t.tags.none : t.filter.noTags}</p>
      )}
      {canCreate ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <ColorSwatches value={color} onValueChange={setColor} label={t.tags.color} names={t.colors} noneLabel={t.colors.none} />
          <Button size="sm" icon={<Plus aria-hidden />} loading={createTag.isPending} onClick={() => void create()}>
            <span className="truncate">{fill(t.tags.create, { name: query.trim() })}</span>
          </Button>
        </div>
      ) : null}
    </Popover>
  );
}
