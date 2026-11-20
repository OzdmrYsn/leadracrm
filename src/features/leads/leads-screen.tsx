"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Download, Ellipsis, Funnel, ListChecks, Plus, Tags, Trash2, TriangleAlert, Undo2, Upload } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Menu, type MenuItem } from "@/components/ui/overlay";
import { SortTh, useSort, type SortState } from "@/components/ui/sort-th";
import { Tag } from "@/components/ui/tag";
import { Checkbox } from "@/components/ui/toggle";
import { NewLeadDialog } from "@/features/board/new-lead-dialog";
import { FilterBar } from "@/features/filter/filter-bar";
import { TagsDialog } from "@/features/tags/tags-dialog";
import { emptyFilter, isFiltered, toLeadFilter, type LeadFilterState } from "@/features/filter/filter-state";
import { fill, useI18n } from "@/i18n";
import { BulkBar } from "./bulk-bar";
import { useExport } from "./export-button";
import { ImportDialog } from "./import-dialog";
import { errorText } from "@/lib/errors";
import { formatAgo, formatMoney } from "@/lib/format";
import { filterQuery, useDebounced, useLeads, useNow, useRestoreLead, useSession } from "@/lib/hooks";
import { canAdd, canExport } from "@/lib/rights";
import type { BulkResult, Id, LeadSummary } from "@/lib/types";

type SortKey = "name" | "price" | "updated";
type Sort = SortState<SortKey>;

function sortLeads(rows: LeadSummary[], sort: Sort, locale: string): LeadSummary[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    if (sort.key === "name") return sign * a.name.localeCompare(b.name, locale);
    if (sort.key === "price") return sign * (a.priceMinor - b.priceMinor);
    return sign * a.updatedAt.localeCompare(b.updatedAt);
  });
}

export function LeadsScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const session = useSession(ws);
  // Oturum yüklenene kadar düğme yerinde durur; yüklendikten sonra ekleme yetkisi yoksa gizlenir.
  const mayAdd = !session.data || canAdd(session.data, "leads");
  const now = useNow();
  const [filterState, setFilterState] = useState<LeadFilterState>(emptyFilter);
  const { sort, toggle, directionOf } = useSort<SortKey>({ key: "updated", direction: "desc" });
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const settledQuery = useDebounced(filterState.query);
  const leadFilter = toLeadFilter(filterState, "list", settledQuery);
  const leads = useLeads(ws, leadFilter);
  // Kaynaklar ekranındaki "Excel ve CSV" karosu buraya ?import=1 ile gelir; pencere açık başlar.
  const [importOpen, setImportOpen] = useState(useSearchParams().get("import") === "1");
  const [tagsOpen, setTagsOpen] = useState(false);
  const restore = useRestoreLead(ws);
  // Çöp kutusu görünümü: satırlar bağlantı değildir (silinmiş lead'in kartı açılmaz), seçim yerine "Geri al" vardır.
  const trash = filterState.status === "deleted";
  const moreRef = useRef<HTMLButtonElement>(null);

  const locale = session.data?.workspace.locale ?? "tr-TR";
  const allStages = (session.data?.pipelines ?? []).flatMap((pipeline) => pipeline.stages);
  const stages = new Map(allStages.map((stage) => [stage.id, stage]));
  const rows = sortLeads(leads.data ?? [], sort, locale);
  const filtered = isFiltered(filterState, "list");

  // Seçim: süzgeç değişince listede kalmayan lead'ler seçimden kendiliğinden düşer.
  const [picked, setPicked] = useState<ReadonlySet<Id>>(new Set());
  const [outcome, setOutcome] = useState<{ text: string; warning: boolean } | null>(null);
  const selectedIds = rows.filter((lead) => picked.has(lead.id)).map((lead) => lead.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function pick(id: Id, on: boolean) {
    setOutcome(null);
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const exporter = useExport(setOutcome);
  // Dışa aktarma ekrandaki süzgeci kullanır: listede ne görünüyorsa o iner.
  const moreItems: MenuItem[] = [
    ...(session.data?.user.isAdmin ? [{ label: t.transfer.import, icon: <Upload aria-hidden />, onSelect: () => setImportOpen(true) }] : []),
    ...(session.data ? [{ label: t.tags.manage, icon: <Tags aria-hidden />, onSelect: () => setTagsOpen(true) }] : []),
    ...(canExport(session.data, "leads") && !trash
      ? [{ label: t.transfer.export, icon: <Download aria-hidden />, disabled: exporter.pending, onSelect: () => void exporter.run(`/api/w/${ws}/leads/export?${filterQuery(leadFilter)}`) }]
      : []),
  ];

  function onBulkDone(mode: string, result: BulkResult) {
    const done = fill(mode === "delete" ? t.bulk.deleted : t.bulk.done, { count: result.done });
    const reasons = [...new Set(result.skipped.map((item) => (t.bulk.reasons as Record<string, string>)[item.reason] ?? t.bulk.reasons.other))];
    const skipped = result.skipped.length ? ` ${fill(t.bulk.skipped, { count: result.skipped.length, reasons: reasons.join(", ") })}` : "";
    setOutcome({ text: done + skipped, warning: result.skipped.length > 0 });
    // Atlananlar seçili kalır: kullanıcı hangileri olduğunu görür.
    setPicked(new Set(result.skipped.map((item) => item.id)));
  }

  const columns: Array<{ label: string; key?: SortKey; align?: "right" }> = [
    { label: t.leads.colName, key: "name" },
    { label: t.leads.colStage },
    { label: t.leads.colContact },
    { label: t.leads.colPrice, key: "price", align: "right" },
    { label: t.leads.colResponsible },
    { label: t.leads.colUpdated, key: "updated" },
  ];

  return (
    <>
      <ScreenHeader title={t.leads.title}>
        <nav aria-label={t.board.title} className="flex gap-1">
          <Link
            href={`/w/${ws}/pipelines`}
            className="flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            {t.board.viewBoard}
          </Link>
          <span aria-current="page" className="flex h-8 items-center rounded-md bg-accent-soft px-3 text-sm font-semibold text-accent">
            {t.board.viewList}
          </span>
        </nav>
        {mayAdd ? (
          <Button
            ref={addButtonRef}
            variant="primary"
            size="sm"
            icon={<Plus aria-hidden />}
            onClick={() => setNewLeadOpen(true)}
            disabled={!session.data}
          >
            {t.board.addLead}
          </Button>
        ) : null}
        {moreItems.length > 0 ? (
          <Menu
            items={moreItems}
            trigger={
              <Button ref={moreRef} variant="ghost" size="sm" iconOnly aria-label={t.transfer.more}>
                <Ellipsis aria-hidden />
              </Button>
            }
          />
        ) : null}
      </ScreenHeader>

      <FilterBar
        ws={ws}
        session={session.data}
        scope="list"
        value={filterState}
        onChange={setFilterState}
        stages={allStages.filter((stage) => stage.kind === "open" || stage.kind === "incoming")}
      >
        <p role="status" className="text-sm text-muted">
          {leads.data ? fill(t.leads.count, { count: rows.length }) : ""}
        </p>
      </FilterBar>

      {session.data && selectedIds.length > 0 && !trash ? (
        <BulkBar ws={ws} session={session.data} ids={selectedIds} onClear={() => setPicked(new Set())} onDone={onBulkDone} />
      ) : null}
      {outcome ? (
        <div className="shrink-0 px-3 pt-2">
          <Notice tone={outcome.warning ? "warning" : "success"} icon={outcome.warning ? <TriangleAlert aria-hidden /> : <Check aria-hidden />}>
            {outcome.text}
          </Notice>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
        <div className="w-fit min-w-full overflow-clip rounded-lg border bg-bg shadow-card">
        {leads.isPending ? (
          <div aria-busy className="flex flex-col gap-2 p-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : leads.isError ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={t.common.loadFailed}
            action={
              <Button variant="secondary" onClick={() => void leads.refetch()}>
                {t.common.retry}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          trash ? (
            <EmptyState icon={<Trash2 />} title={t.leads.trashEmptyTitle} body={t.leads.trashEmptyBody} />
          ) : filtered ? (
            <EmptyState
              icon={<Funnel />}
              title={t.filter.filteredEmptyTitle}
              body={t.filter.filteredEmptyBody}
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilterState(emptyFilter)}>
                  {t.filter.clear}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ListChecks />}
              title={t.leads.emptyTitle}
              body={t.leads.emptyBody}
              action={
                mayAdd ? (
                  <Button variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setNewLeadOpen(true)}>
                    {t.board.addLead}
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <table className="w-full min-w-3xl border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className={trash ? "hidden" : "w-10 px-3 py-1"}>
                  <Checkbox
                    large
                    checked={allSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(checked) => {
                      setOutcome(null);
                      setPicked(checked === true ? new Set(rows.map((lead) => lead.id)) : new Set());
                    }}
                    aria-label={t.bulk.selectAll}
                  />
                </th>
                {columns.map((column) => {
                  const key = column.key;
                  return (
                    <SortTh
                      key={column.label}
                      label={column.label}
                      align={column.align}
                      direction={key ? directionOf(key) : null}
                      onSort={key ? () => toggle(key) : undefined}
                      title={fill(t.leads.sortBy, { column: column.label })}
                    />
                  );
                })}
                {trash ? (
                  <th scope="col" className="px-3 py-1 font-medium">
                    <span className="sr-only">{t.leads.colActions}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const stage = stages.get(lead.stageId);
                return (
                  <tr key={lead.id} className={picked.has(lead.id) ? "border-b bg-accent-soft" : "border-b transition-colors hover:bg-surface"}>
                    <td className={trash ? "hidden" : "w-10 px-3 py-2"}>
                      <Checkbox large checked={picked.has(lead.id)} onCheckedChange={(checked) => pick(lead.id, checked === true)} aria-label={fill(t.bulk.selectOne, { name: lead.name })} />
                    </td>
                    <th scope="row" className="max-w-xs px-3 py-2 font-medium">
                      {trash ? (
                        <span className="block truncate text-fg">{lead.name}</span>
                      ) : (
                        <Link href={`/w/${ws}/leads/${lead.id}`} className="block truncate rounded-sm font-semibold text-accent underline-offset-2 hover:underline">
                          {lead.name}
                        </Link>
                      )}
                    </th>
                    <td className="px-3 py-2">{stage ? <Tag color={stage.color}>{stage.name}</Tag> : t.common.none}</td>
                    <td className="max-w-56 truncate px-3 py-2 text-fg">
                      {[lead.contactName, lead.companyName].filter(Boolean).join(" · ") || <span className="text-muted">{t.common.none}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-fg tabular-nums">
                      {lead.priceMinor > 0 ? formatMoney(lead.priceMinor, lead.currency, locale) : <span className="text-muted">{t.common.none}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {lead.responsible ? (
                        <span className="flex items-center gap-2 text-fg">
                          <Avatar name={lead.responsible.name} size="sm" locale={locale} decorative />
                          <span className="truncate">{lead.responsible.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted">{t.common.unassigned}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted">{formatAgo(lead.updatedAt, now, t.time)}</td>
                    {trash ? (
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          icon={<Undo2 aria-hidden />}
                          aria-label={fill(t.leads.restoreLabel, { name: lead.name })}
                          disabled={restore.isPending}
                          onClick={() =>
                            restore.mutateAsync(lead.id).then(
                              () => setOutcome({ text: fill(t.leads.restored, { name: lead.name }), warning: false }),
                              (error: unknown) => setOutcome({ text: errorText(error, t), warning: true }),
                            )
                          }
                        >
                          {t.leads.restore}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        </div>
      </div>

      {session.data ? (
        <>
          <NewLeadDialog ws={ws} session={session.data} open={newLeadOpen} onOpenChange={setNewLeadOpen} returnFocusTo={addButtonRef} />
          <ImportDialog ws={ws} session={session.data} open={importOpen && session.data.user.isAdmin} onOpenChange={setImportOpen} returnFocusTo={moreRef} />
          <TagsDialog ws={ws} canEdit={session.data.user.isAdmin} open={tagsOpen} onOpenChange={setTagsOpen} returnFocusTo={moreRef} />
        </>
      ) : null}
    </>
  );
}
