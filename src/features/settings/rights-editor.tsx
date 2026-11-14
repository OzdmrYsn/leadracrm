"use client";

import { useId } from "react";
import { AccessLevelControl } from "@/components/ui/access-level";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { RIGHTS_PRESETS } from "@/lib/rights";
import type { AccessLevel, Rights } from "@/lib/types";

export const RIGHT_ENTITIES = ["leads", "contacts", "companies", "tasks", "inbox"] as const;
type Entity = (typeof RIGHT_ENTITIES)[number];
type Action = "view" | "edit" | "add" | "delete" | "export";

export const RIGHT_ACTIONS: Record<Entity, Action[]> = {
  leads: ["view", "edit", "add", "delete", "export"],
  contacts: ["view", "edit", "add", "delete", "export"],
  companies: ["view", "edit", "add", "delete", "export"],
  tasks: ["view", "edit", "delete"],
  inbox: ["view"],
};

const read = (rights: Rights, entity: Entity, action: Action) => (rights[entity] as Record<string, AccessLevel | boolean>)[action];

/** Yetki matrisi: her kayıt türü için görme, düzenleme, ekleme ve silme kapsamı. */
export function RightsEditor({ value, onChange }: { value: Rights; onChange: (next: Rights) => void }) {
  const { t } = useI18n();
  const id = useId();
  const set = (entity: Entity, action: Action, next: AccessLevel | boolean) => onChange({ ...value, [entity]: { ...value[entity], [action]: next } });
  const preset = (name: keyof typeof RIGHTS_PRESETS) => onChange(RIGHTS_PRESETS[name]);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t.access.presets} className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t.access.presets}</span>
        <Button size="sm" onClick={() => preset("full")}>
          {t.access.presetFull}
        </Button>
        <Button size="sm" onClick={() => preset("own")}>
          {t.access.presetOwn}
        </Button>
        <Button size="sm" onClick={() => preset("read")}>
          {t.access.presetRead}
        </Button>
      </div>
      <p className="text-xs text-muted">{t.access.help}</p>
      {RIGHT_ENTITIES.map((entity) => (
        <fieldset key={entity} className="flex flex-col gap-2 rounded-md border px-3 pt-1 pb-3">
          <legend className="px-1 text-sm font-semibold text-fg">{t.access.entities[entity]}</legend>
          {RIGHT_ACTIONS[entity].map((action) =>
            action === "add" ? (
              <div key={action} className="flex min-h-8 items-center justify-between gap-3">
                <label htmlFor={`${id}-${entity}-add`} className="text-sm text-fg">
                  {t.access.actions.add}
                </label>
                <Checkbox
                  id={`${id}-${entity}-add`}
                  // Üç kayıt türünde de "Ekleme" var; okunur ad hangisi olduğunu söyler.
                  aria-label={fill(t.access.cell, { entity: t.access.entities[entity], action: t.access.actions.add })}
                  checked={read(value, entity, "add") === true}
                  onCheckedChange={(checked) => set(entity, "add", checked === true)}
                />
              </div>
            ) : (
              <div key={action} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span aria-hidden className="text-sm text-fg">
                  {t.access.actions[action]}
                </span>
                <AccessLevelControl
                  value={read(value, entity, action) as AccessLevel}
                  onValueChange={(next) => set(entity, action, next)}
                  label={fill(t.access.cell, { entity: t.access.entities[entity], action: t.access.actions[action] })}
                  labels={t.access.levels}
                />
              </div>
            ),
          )}
        </fieldset>
      ))}
    </div>
  );
}

/** Yetkilerin salt okunur özeti. */
export function RightsSummary({ value }: { value: Rights }) {
  const { t } = useI18n();
  return (
    <dl className="flex flex-col gap-2">
      {RIGHT_ENTITIES.map((entity) => (
        <div key={entity} className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border px-3 py-2">
          <dt className="w-28 shrink-0 text-sm font-medium text-fg">{t.access.entities[entity]}</dt>
          <dd className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {RIGHT_ACTIONS[entity].map((action) => {
              const current = read(value, entity, action);
              const text = typeof current === "boolean" ? (current ? t.access.allowed : t.access.denied) : t.access.levels[current];
              return (
                <span key={action}>
                  {t.access.actions[action]}: <span className="text-fg">{text}</span>
                </span>
              );
            })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
