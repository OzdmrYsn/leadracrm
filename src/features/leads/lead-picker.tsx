"use client";

import { useState, type ReactNode } from "react";
import { SearchPicker } from "@/components/app/search-picker";
import { useI18n } from "@/i18n";
import { useDebounced, useLeads } from "@/lib/hooks";
import type { LeadSummary } from "@/lib/types";

/** Lead seçici: açık lead'lerde arar. */
export function LeadPicker({
  ws,
  trigger,
  locale,
  onPick,
  accepts,
}: {
  ws: string;
  trigger: ReactNode;
  locale: string;
  onPick: (lead: LeadSummary) => void;
  /** Verilirse yalnız bu koşulu sağlayan lead'ler listelenir. */
  accepts?: (lead: LeadSummary) => boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const settled = useDebounced(query.trim());
  const leads = useLeads(ws, { query: settled, status: "open" });
  const list = (leads.data ?? []).filter((lead) => accepts?.(lead) ?? true).slice(0, 20);

  return (
    <SearchPicker
      trigger={trigger}
      label={t.leadPicker.panel}
      searchLabel={t.leadPicker.searchLabel}
      placeholder={t.leadPicker.searchPlaceholder}
      hint={t.leadPicker.hint}
      noMatch={t.leadPicker.noMatch}
      items={list.map((lead) => ({
        id: lead.id,
        title: lead.name,
        subtitle: [lead.contactName, lead.companyName].filter(Boolean).join(" · ") || null,
      }))}
      loading={leads.isPending}
      query={query}
      onQueryChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      onPick={async (id) => {
        const lead = list.find((item) => item.id === id);
        if (lead) onPick(lead);
      }}
      locale={locale}
    />
  );
}
