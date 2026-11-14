"use client";

import { useState, type ReactNode } from "react";
import { SearchPicker } from "@/components/app/search-picker";
import { fill, useI18n } from "@/i18n";
import { useCompanies, useCreateCompany, useDebounced } from "@/lib/hooks";
import type { Id } from "@/lib/types";

/** Şirket seçici: arar, seçer; eşleşme yoksa yazılan adla yeni şirket oluşturur. */
export function CompanyPicker({
  ws,
  trigger,
  locale,
  onPick,
}: {
  ws: string;
  trigger: ReactNode;
  locale: string;
  /** Şirketin adı da verilir; seçimi yalnız ekranda tutan formlar için. */
  onPick: (companyId: Id, name: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const settled = useDebounced(query.trim());
  const companies = useCompanies(ws, settled, open);
  const create = useCreateCompany(ws);

  return (
    <SearchPicker
      trigger={trigger}
      label={t.company.panel}
      searchLabel={t.company.searchLabel}
      placeholder={t.company.searchPlaceholder}
      hint={t.company.hint}
      noMatch={t.company.noMatch}
      items={(companies.data ?? []).slice(0, 20).map((company) => ({ id: company.id, title: company.name }))}
      loading={companies.isPending}
      query={query}
      onQueryChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      onPick={(id) => onPick(id, companies.data?.find((company) => company.id === id)?.name ?? query.trim())}
      onCreate={async (name) => (await create.mutateAsync({ name })).id}
      createLabel={fill(t.company.create, { name: query.trim() })}
      locale={locale}
    />
  );
}
