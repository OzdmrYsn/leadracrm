"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, Plus, SearchX, TriangleAlert } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { SortTh, useSort, type SortState } from "@/components/ui/sort-th";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCompanies, useCreateCompany, useDebounced, useSession } from "@/lib/hooks";
import { canAdd, canExport } from "@/lib/rights";
import { ExportButton } from "@/features/leads/export-button";
import type { CompanySummary } from "@/lib/types";

type SortKey = "name" | "contacts" | "leads";

function sortRows(rows: CompanySummary[], sort: SortState<SortKey>, locale: string): CompanySummary[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (sort.key === "contacts") return sign * (a.contactCount - b.contactCount) || a.name.localeCompare(b.name, locale);
    if (sort.key === "leads") return sign * (a.leadCount - b.leadCount) || a.name.localeCompare(b.name, locale);
    return sign * a.name.localeCompare(b.name, locale);
  });
}

/** Yeni şirket: yalnız ad. Eklenince şirket kartı açılır; geri kalan bilgiler orada girilir. */
function NewCompanyForm({ ws, onDone }: { ws: string; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const create = useCreateCompany(ws);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setError(t.companies.nameRequired);
      return;
    }
    setError(null);
    create.mutate(
      { name },
      {
        onSuccess: (company) => {
          onDone();
          router.push(`/w/${ws}/companies/${company.id}`);
        },
        onError: (problem) => setError(errorText(problem, t)),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field id="company-name" label={t.companies.name} error={error ?? undefined} required>
        <Input
          id="company-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={255}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          required
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t.companies.submit}
        </Button>
      </div>
    </form>
  );
}

export function CompaniesScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const session = useSession(ws);
  // Oturum yüklenene kadar düğme yerinde durur; yüklendikten sonra ekleme yetkisi yoksa gizlenir.
  const mayAdd = !session.data || canAdd(session.data, "companies");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const { sort, toggle, directionOf } = useSort<SortKey>({ key: "name", direction: "asc" });
  const settled = useDebounced(query.trim());
  const companies = useCompanies(ws, settled);
  const [exportResult, setExportResult] = useState<{ text: string; warning: boolean } | null>(null);

  const locale = session.data?.workspace.locale ?? "tr-TR";
  const rows = sortRows(companies.data ?? [], sort, locale);
  const sortTitle = (column: string) => fill(t.leads.sortBy, { column });

  return (
    <>
      <ScreenHeader title={t.companies.title}>
        {canExport(session.data, "companies") ? (
          <ExportButton path={`/api/w/${ws}/companies/export${settled ? `?q=${encodeURIComponent(settled)}` : ""}`} onResult={setExportResult} />
        ) : null}
        {mayAdd ? (
          <Button ref={addRef} variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
            {t.companies.add}
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
      <div role="search" aria-label={t.companies.searchLabel} className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-bg px-3 py-2">
        <label htmlFor="companies-search" className="sr-only">
          {t.companies.searchLabel}
        </label>
        <Input
          id="companies-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.companies.searchPlaceholder}
          className="h-8 w-full sm:w-80"
        />
        <p role="status" className="text-sm text-muted">
          {companies.data ? fill(t.companies.count, { count: rows.length }) : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
        <div className="w-fit min-w-full overflow-clip rounded-lg border bg-bg shadow-card">
        {companies.isPending ? (
          <div aria-busy className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : companies.isError ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={t.common.loadFailed}
            action={
              <Button variant="secondary" onClick={() => void companies.refetch()}>
                {t.common.retry}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          settled ? (
            <EmptyState icon={<SearchX />} title={t.companies.noResultsTitle} body={fill(t.companies.noResultsBody, { query: settled })} />
          ) : (
            <EmptyState
              icon={<Building2 />}
              title={t.companies.emptyTitle}
              body={t.companies.emptyBody}
              action={
                mayAdd ? (
                  <Button variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
                    {t.companies.add}
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <table className="w-full min-w-xl border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-xs text-muted">
              <tr>
                <SortTh label={t.companies.colName} direction={directionOf("name")} onSort={() => toggle("name")} title={sortTitle(t.companies.colName)} />
                <SortTh
                  label={t.companies.colContacts}
                  direction={directionOf("contacts")}
                  onSort={() => toggle("contacts")}
                  title={sortTitle(t.companies.colContacts)}
                  align="right"
                />
                <SortTh
                  label={t.companies.colLeads}
                  direction={directionOf("leads")}
                  onSort={() => toggle("leads")}
                  title={sortTitle(t.companies.colLeads)}
                  align="right"
                />
                <SortTh label={t.companies.colResponsible} />
              </tr>
            </thead>
            <tbody>
              {rows.map((company) => (
                <tr key={company.id} className="border-b transition-colors hover:bg-surface">
                  <th scope="row" className="max-w-sm px-3 py-2 font-medium">
                    <Link href={`/w/${ws}/companies/${company.id}`} className="block truncate rounded-sm font-semibold text-accent underline-offset-2 hover:underline">
                      {company.name}
                    </Link>
                  </th>
                  <td className="px-3 py-2 text-right text-fg tabular-nums">{company.contactCount}</td>
                  <td className="px-3 py-2 text-right text-fg tabular-nums">{company.leadCount}</td>
                  <td className="px-3 py-2">
                    {company.responsible ? (
                      <span className="flex items-center gap-2 text-fg">
                        <Avatar name={company.responsible.name} size="sm" locale={locale} decorative />
                        <span className="truncate">{company.responsible.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted">{t.common.unassigned}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </div>

      <Dialog title={t.companies.newTitle} closeLabel={t.common.close} open={adding} onOpenChange={setAdding} returnFocusTo={addRef}>
        <NewCompanyForm ws={ws} onDone={() => setAdding(false)} />
      </Dialog>
    </>
  );
}
