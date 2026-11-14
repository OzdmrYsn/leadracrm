"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Funnel, X } from "lucide-react";
import { Button, ToggleButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { useTags } from "@/lib/hooks";
import type { Session, Stage } from "@/lib/types";
import { ANY, emptyFilter, isFiltered, panelCount, type LeadFilterState } from "./filter-state";
import { SavedFilters } from "./saved-filters";

/**
 * Pano ve liste için ortak süzgeç çubuğu: arama, hızlı süzgeçler, ayrıntılı ölçütler.
 * children sağda gösterilir (örneğin sonuç sayısı).
 */
export function FilterBar({
  ws,
  session,
  scope,
  value,
  onChange,
  stages = [],
  children,
}: {
  ws: string;
  session: Session | undefined;
  scope: "board" | "list";
  value: LeadFilterState;
  /** useState'in ayarlayıcısı. Güncellemeler bir önceki duruma göre yapılır; art arda gelen iki değişiklik birbirini ezmez. */
  onChange: Dispatch<SetStateAction<LeadFilterState>>;
  /** Yalnız liste: aşama seçicisinin seçenekleri. */
  stages?: Stage[];
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const tags = useTags(ws);
  const set = (patch: Partial<LeadFilterState>) => onChange((current) => ({ ...current, ...patch }));
  const count = panelCount(value, scope);
  const mine = value.responsible === "me";

  return (
    <div role="search" aria-label={t.filter.label} className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-bg px-3 py-2">
      <label htmlFor={`filter-search-${scope}`} className="sr-only">
        {t.filter.searchLabel}
      </label>
      <Input
        id={`filter-search-${scope}`}
        type="search"
        value={value.query}
        onChange={(event) => set({ query: event.target.value })}
        placeholder={t.filter.searchPlaceholder}
        className="h-8 w-full sm:w-64"
      />

      <div role="group" aria-label={t.filter.quick} className="flex flex-wrap gap-1">
        <ToggleButton pressed={mine} onClick={() => onChange((current) => ({ ...current, responsible: current.responsible === "me" ? ANY : "me" }))}>
          {t.filter.mine}
        </ToggleButton>
        <ToggleButton pressed={value.noTask} onClick={() => onChange((current) => ({ ...current, noTask: !current.noTask }))}>
          {t.filter.noTask}
        </ToggleButton>
        <ToggleButton pressed={value.unread} onClick={() => onChange((current) => ({ ...current, unread: !current.unread }))}>
          {t.filter.unread}
        </ToggleButton>
      </div>

      {scope === "list" ? (
        <div role="group" aria-label={t.filter.status.label} className="flex flex-wrap gap-1 border-l pl-2">
          {(["open", "won", "lost", "all", "deleted"] as const).map((status) => (
            <ToggleButton key={status} pressed={value.status === status} onClick={() => set({ status })}>
              {t.filter.status[status]}
            </ToggleButton>
          ))}
        </div>
      ) : null}

      <Popover
        label={t.filter.panel}
        trigger={
          <Button size="sm" icon={<Funnel aria-hidden />}>
            {count > 0 ? fill(t.filter.moreActive, { count }) : t.filter.more}
          </Button>
        }
      >
        <Field id={`filter-responsible-${scope}`} label={t.filter.responsible}>
          <Select
            id={`filter-responsible-${scope}`}
            value={value.responsible}
            onValueChange={(responsible) => set({ responsible })}
            options={[
              { value: ANY, label: t.filter.anyone },
              { value: "me", label: t.filter.me },
              ...(session?.users ?? []).filter((user) => user.id !== session?.user.id).map((user) => ({ value: user.id, label: user.name })),
              { value: "none", label: t.common.unassigned },
            ]}
          />
        </Field>

        {scope === "list" ? (
          <Field id="filter-stage" label={t.filter.stage}>
            <Select
              id="filter-stage"
              value={value.stageId}
              onValueChange={(stageId) => set({ stageId })}
              options={[
                { value: ANY, label: t.filter.anyStage },
                ...stages.map((stage) => ({ value: stage.id, label: stage.name, swatch: `--stage-${stage.color}` })),
              ]}
            />
          </Field>
        ) : null}

        <fieldset className="flex flex-col gap-1">
          <legend className="pb-1 text-sm font-medium text-fg">{t.filter.tags}</legend>
          {(tags.data ?? []).length > 0 ? (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {(tags.data ?? []).map((tag) => (
                <li key={tag.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 hover:bg-surface">
                    <Checkbox
                      checked={value.tagIds.includes(tag.id)}
                      onCheckedChange={(checked) =>
                        onChange((current) => ({
                          ...current,
                          tagIds: checked === true ? [...current.tagIds, tag.id] : current.tagIds.filter((id) => id !== tag.id),
                        }))
                      }
                    />
                    <Tag color={tag.color}>{tag.name}</Tag>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t.filter.noTags}</p>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <Field id={`filter-from-${scope}`} label={t.filter.createdFrom}>
            <Input
              id={`filter-from-${scope}`}
              type="date"
              value={value.createdFrom}
              max={value.createdTo || undefined}
              onChange={(event) => set({ createdFrom: event.target.value })}
              className="px-2"
            />
          </Field>
          <Field id={`filter-to-${scope}`} label={t.filter.createdTo}>
            <Input
              id={`filter-to-${scope}`}
              type="date"
              value={value.createdTo}
              min={value.createdFrom || undefined}
              onChange={(event) => set({ createdTo: event.target.value })}
              className="px-2"
            />
          </Field>
        </div>
      </Popover>

      <SavedFilters ws={ws} scope={scope} value={value} onChange={onChange} />

      {isFiltered(value, scope) ? (
        <Button variant="ghost" size="sm" icon={<X aria-hidden />} onClick={() => onChange(emptyFilter)}>
          {t.filter.clear}
        </Button>
      ) : null}

      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
