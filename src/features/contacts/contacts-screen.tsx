"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Plus, SearchX, TriangleAlert, Users } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SortTh, useSort, type SortState } from "@/components/ui/sort-th";
import { fill, useI18n } from "@/i18n";
import { useContacts, useDebounced, useSession } from "@/lib/hooks";
import { canAdd, canExport } from "@/lib/rights";
import { ExportButton } from "@/features/leads/export-button";
import type { ContactSummary } from "@/lib/types";
import { NewContactDialog } from "./new-contact-dialog";

type SortKey = "name" | "company" | "leads";

const ANYONE = "any";
const UNASSIGNED = "none";

function sortRows(rows: ContactSummary[], sort: SortState<SortKey>, locale: string): ContactSummary[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (sort.key === "leads") return sign * (a.leadCount - b.leadCount) || a.name.localeCompare(b.name, locale);
    if (sort.key === "company") return sign * (a.company ?? "").localeCompare(b.company ?? "", locale) || a.name.localeCompare(b.name, locale);
    return sign * a.name.localeCompare(b.name, locale);
  });
}

export function ContactsScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const session = useSession(ws);
  // Oturum yüklenene kadar düğme yerinde durur; yüklendikten sonra ekleme yetkisi yoksa gizlenir.
  const mayAdd = !session.data || canAdd(session.data, "contacts");
  const [query, setQuery] = useState("");
  const [responsible, setResponsible] = useState(ANYONE);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const { sort, toggle, directionOf } = useSort<SortKey>({ key: "name", direction: "asc" });
  const settled = useDebounced(query.trim());
  const contacts = useContacts(ws, settled);
  const [exportResult, setExportResult] = useState<{ text: string; warning: boolean } | null>(null);

  const locale = session.data?.workspace.locale ?? "tr-TR";
  const visible = (contacts.data ?? []).filter((contact) =>
    responsible === ANYONE ? true : responsible === UNASSIGNED ? contact.responsible === null : contact.responsible?.id === responsible,
  );
  const rows = sortRows(visible, sort, locale);
  const narrowed = settled !== "" || responsible !== ANYONE;
  const sortTitle = (column: string) => fill(t.leads.sortBy, { column });

  return (
    <>
      <ScreenHeader title={t.contacts.title}>
        {canExport(session.data, "contacts") ? (
          <ExportButton path={`/api/w/${ws}/contacts/export${settled ? `?q=${encodeURIComponent(settled)}` : ""}`} onResult={setExportResult} />
        ) : null}
        {mayAdd ? (
          <Button ref={addRef} variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
            {t.contacts.add}
          </Button>
        ) : null}
      </ScreenHeader>

      {exportResult ? (
        <div className="shrink-0 px-3 pt-2">
          <Notice tone={exportResult.warning ? "warning" : "success"} icon={exportResult.warning ? <TriangleAlert aria-hidden /> : <Check aria-hidden />}>
            {exportResult.text}
          </Notice>
        </div>
      ) : null}
      <div role="search" aria-label={t.contacts.searchLabel} className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-bg px-3 py-2">
        <label htmlFor="contacts-search" className="sr-only">
          {t.contacts.searchLabel}
        </label>
        <Input
          id="contacts-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.contacts.searchPlaceholder}
          className="h-8 w-full sm:w-80"
        />
        <Select
          aria-label={t.common.responsibleFilter}
          value={responsible}
          onValueChange={setResponsible}
          className="h-8 w-full sm:w-52"
          options={[
            { value: ANYONE, label: t.common.allResponsible },
            ...(session.data?.users ?? []).map((user) => ({ value: user.id, label: user.name })),
            { value: UNASSIGNED, label: t.common.unassigned },
          ]}
        />
        <p role="status" className="text-sm text-muted">
          {contacts.data ? fill(t.contacts.count, { count: rows.length }) : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
        <div className="w-fit min-w-full overflow-clip rounded-lg border bg-bg shadow-card">
        {contacts.isPending ? (
          <div aria-busy className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : contacts.isError ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={t.common.loadFailed}
            action={
              <Button variant="secondary" onClick={() => void contacts.refetch()}>
                {t.common.retry}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          narrowed ? (
            <EmptyState
              icon={<SearchX />}
              title={t.contacts.noResultsTitle}
              body={settled ? fill(t.contacts.noResultsBody, { query: settled }) : t.filter.filteredEmptyBody}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setResponsible(ANYONE);
                  }}
                >
                  {t.filter.clear}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users />}
              title={t.contacts.emptyTitle}
              body={t.contacts.emptyBody}
              action={
                mayAdd ? (
                  <Button variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
                    {t.contacts.add}
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-xs text-muted">
              <tr>
                <SortTh label={t.contacts.colName} direction={directionOf("name")} onSort={() => toggle("name")} title={sortTitle(t.contacts.colName)} />
                <SortTh
                  label={t.contacts.colCompany}
                  direction={directionOf("company")}
                  onSort={() => toggle("company")}
                  title={sortTitle(t.contacts.colCompany)}
                />
                <SortTh label={t.contacts.colPhone} />
                <SortTh label={t.contacts.colEmail} />
                <SortTh label={t.contacts.colResponsible} />
                <SortTh
                  label={t.contacts.colLeads}
                  direction={directionOf("leads")}
                  onSort={() => toggle("leads")}
                  title={sortTitle(t.contacts.colLeads)}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((contact) => (
                <tr key={contact.id} className="border-b transition-colors hover:bg-surface">
                  <th scope="row" className="max-w-xs px-3 py-2 font-medium">
                    <Link href={`/w/${ws}/contacts/${contact.id}`} className="block truncate rounded-sm text-fg underline-offset-4 hover:underline">
                      {contact.name}
                    </Link>
                  </th>
                  <td className="max-w-56 px-3 py-2">
                    {contact.companyId && contact.company ? (
                      <Link href={`/w/${ws}/companies/${contact.companyId}`} className="block truncate rounded-sm text-fg underline-offset-4 hover:underline">
                        {contact.company}
                      </Link>
                    ) : (
                      <span className="text-muted">{t.common.none}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-fg">{contact.phone ?? <span className="text-muted">{t.common.none}</span>}</td>
                  <td className="max-w-56 truncate px-3 py-2 text-fg">{contact.email ?? <span className="text-muted">{t.common.none}</span>}</td>
                  <td className="px-3 py-2">
                    {contact.responsible ? (
                      <span className="flex items-center gap-2 text-fg">
                        <Avatar name={contact.responsible.name} size="sm" locale={locale} decorative />
                        <span className="truncate">{contact.responsible.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted">{t.common.unassigned}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-fg tabular-nums">{contact.leadCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>

      <NewContactDialog ws={ws} locale={locale} open={adding} onOpenChange={setAdding} returnFocusTo={addRef} />
    </>
  );
}
