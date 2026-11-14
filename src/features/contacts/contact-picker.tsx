"use client";

import { useState, type ReactNode } from "react";
import { SearchPicker } from "@/components/app/search-picker";
import { fill, useI18n } from "@/i18n";
import { useContacts, useCreateContact, useDebounced } from "@/lib/hooks";
import type { Id } from "@/lib/types";

/** Kişi seçici: arar, seçer; eşleşme yoksa yazılan adla yeni kişi oluşturur. */
export function ContactPicker({
  ws,
  trigger,
  locale,
  onPick,
}: {
  ws: string;
  trigger: ReactNode;
  locale: string;
  /** Kişinin adı da verilir; seçimi yalnız ekranda tutan formlar için. */
  onPick: (contactId: Id, name: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const settled = useDebounced(query.trim());
  const contacts = useContacts(ws, settled, open);
  const create = useCreateContact(ws);

  return (
    <SearchPicker
      trigger={trigger}
      label={t.contact.panel}
      searchLabel={t.contact.searchLabel}
      placeholder={t.contact.searchPlaceholder}
      hint={t.contact.hint}
      noMatch={t.contact.none}
      items={(contacts.data ?? []).slice(0, 20).map((contact) => ({ id: contact.id, title: contact.name, subtitle: contact.company }))}
      loading={contacts.isPending}
      query={query}
      onQueryChange={setQuery}
      open={open}
      onOpenChange={setOpen}
      onPick={(id) => onPick(id, contacts.data?.find((contact) => contact.id === id)?.name ?? query.trim())}
      onCreate={async (name) => (await create.mutateAsync({ name })).id}
      createLabel={fill(t.contact.create, { name: query.trim() })}
      locale={locale}
    />
  );
}
