"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Check, ChevronDown, Ellipsis, FlaskConical, Funnel, Inbox, PartyPopper, Pencil, Plus, TriangleAlert } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Confetti } from "@/components/ui/confetti";
import { LeadCard, StageHeader } from "@/components/ui/crm";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Menu, type MenuItem } from "@/components/ui/overlay";
import { FilterBar } from "@/features/filter/filter-bar";
import { emptyFilter, isFiltered, toLeadFilter, type LeadFilterState } from "@/features/filter/filter-state";
import { fill, useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatAgo, formatMoney } from "@/lib/format";
import { keys, useBoard, useDebounced, useMoveLead, useNow, useSession, useSimulateInbound } from "@/lib/hooks";
import { canAdd } from "@/lib/rights";
import type { BoardColumn, LeadSummary, Stage } from "@/lib/types";
import { LossReasonDialog } from "./loss-reason-dialog";
import { NewLeadDialog } from "./new-lead-dialog";
import { EditPipelineDialog, NewPipelineDialog } from "./pipeline-dialogs";

const isDev = process.env.NODE_ENV !== "production";

type CardProps = {
  ws: string;
  lead: LeadSummary;
  stages: Stage[];
  currentStage: Stage;
  now: number;
  locale: string;
  onMove: (lead: LeadSummary, stage: Stage) => void;
};

function cardProps(lead: LeadSummary, now: number, locale: string, t: ReturnType<typeof useI18n>["t"]) {
  return {
    name: lead.name,
    contact: [lead.contactName, lead.companyName].filter(Boolean).join(" · ") || undefined,
    price: lead.priceMinor > 0 ? formatMoney(lead.priceMinor, lead.currency, locale) : undefined,
    lastMessage: lead.lastMessagePreview ?? undefined,
    time: formatAgo(lead.lastMessageAt ?? lead.updatedAt, now, t.time),
    tags: lead.tags.map((tag) => ({ label: tag.name, color: tag.color })),
    unread: lead.unread,
    unreadLabel: fill(t.board.unread, { count: lead.unread }),
    owner: lead.responsible?.name,
    locale,
  };
}

/** Sürüklenebilir kart. Klavye ve ekran okuyucu için aynı işlem kart menüsündedir. */
function BoardCard({ ws, lead, stages, currentStage, now, locale, onMove }: CardProps) {
  const { t } = useI18n();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: lead.id });

  const firstOpen = stages.find((stage) => stage.kind === "open");
  const targets = stages.filter((stage) => stage.id !== currentStage.id && stage.kind !== "incoming");
  const items: MenuItem[] = targets.map((stage) => ({
    label: currentStage.kind === "incoming" && stage.id === firstOpen?.id ? t.board.accept : fill(t.board.moveTo, { stage: stage.name }),
    onSelect: () => onMove(lead, stage),
  }));

  return (
    <li ref={setNodeRef} {...listeners} className={cn("touch-none", isDragging && "opacity-40")}>
      <LeadCard
        {...cardProps(lead, now, locale, t)}
        noTaskLabel={currentStage.kind === "open" && !lead.hasTask ? t.board.noTask : undefined}
        href={`/w/${ws}/leads/${lead.id}`}
        actions={
          <Menu
            items={items}
            trigger={
              <Button variant="ghost" size="sm" iconOnly aria-label={fill(t.board.cardMenu, { name: lead.name })}>
                <Ellipsis aria-hidden />
              </Button>
            }
          />
        }
      />
    </li>
  );
}

function Column({
  column,
  children,
  hint,
  dragging,
  locale,
  currency,
}: {
  column: BoardColumn;
  children: ReactNode;
  hint?: string;
  dragging: boolean;
  locale: string;
  currency: string;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id, disabled: column.stage.kind === "incoming" });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.stage.name}
      className={cn(
        "flex w-(--layout-board-column) shrink-0 flex-col gap-2.5 rounded-xl p-1.5 transition-colors",
        isOver && "bg-ink ring-2 ring-highlight",
        dragging && !isOver && column.stage.kind !== "incoming" && "ring-1 ring-sidebar-border",
      )}
    >
      <StageHeader
        name={column.stage.name}
        color={column.stage.color}
        countLabel={fill(t.board.leadCount, { count: column.count })}
        total={column.totalMinor > 0 ? formatMoney(column.totalMinor, currency, locale) : undefined}
      />
      {hint ? <p className="px-2 text-xs text-on-ink-muted">{hint}</p> : null}
      {column.leads.length > 0 ? (
        <ul className="flex flex-col gap-2.5">{children}</ul>
      ) : (
        <p className="rounded-xl border border-dashed border-on-ink-muted px-3 py-6 text-center text-sm text-on-ink-muted">{t.board.emptyColumn}</p>
      )}
    </section>
  );
}

/** Sürükleme sırasında görünen kapatma bölgesi (kazanıldı / kaybedildi). */
function CloseZone({ stage, label }: { stage: Stage; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-14 flex-1 items-center justify-center rounded-md border-2 border-dashed text-sm font-medium transition-colors",
        stage.kind === "won" ? "border-success text-success" : "border-danger text-danger",
        isOver && (stage.kind === "won" ? "bg-success-soft" : "bg-danger-soft"),
      )}
    >
      {label}
    </div>
  );
}

export function BoardScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const pipelineId = useSearchParams().get("p") ?? "main";
  const session = useSession(ws);
  // Oturum yüklenene kadar düğme yerinde durur; yüklendikten sonra ekleme yetkisi yoksa gizlenir.
  const mayAdd = !session.data || canAdd(session.data, "leads");
  const now = useNow();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [filterState, setFilterState] = useState<LeadFilterState>(emptyFilter);
  const settledQuery = useDebounced(filterState.query);
  const filter = toLeadFilter(filterState, "board", settledQuery);
  const board = useBoard(ws, pipelineId, filter);
  const move = useMoveLead(ws, keys.board(ws, pipelineId, filter));
  const simulate = useSimulateInbound(ws);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"lead" | "newPipeline" | "editPipeline" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [lossFor, setLossFor] = useState<{ id: string; name: string } | null>(null);
  // Kazanılan satışın kutlaması: renkli bloklar ve kısa bir şerit. Süstür; duyuru aşağıdaki durum satırından yapılır.
  const [win, setWin] = useState<{ burst: number; name: string; amount: string } | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pipelineMenuRef = useRef<HTMLButtonElement>(null);

  const locale = session.data?.workspace.locale ?? "tr-TR";
  const pipelines = session.data?.pipelines ?? [];
  const pipeline = pipelines.find((item) => item.id === board.data?.pipeline.id) ?? board.data?.pipeline;
  const columns = board.data?.columns ?? [];
  const stages = columns.map((column) => column.stage);
  const allLeads = columns.flatMap((column) => column.leads);
  const activeLead = allLeads.find((lead) => lead.id === activeId) ?? null;
  const visible = columns.filter(
    (column) => column.stage.kind === "open" || (column.stage.kind === "incoming" && column.count > 0),
  );
  const won = stages.find((stage) => stage.kind === "won");
  const lost = stages.find((stage) => stage.kind === "lost");
  const totalOpen = visible.reduce((sum, column) => sum + column.count, 0);
  const filtered = isFiltered(filterState, "board");
  const missingPipeline = board.error instanceof ApiError && board.error.status === 404;

  function switchPipeline(id: string) {
    setProblem(null);
    router.replace(id === "main" ? pathname : `${pathname}?p=${encodeURIComponent(id)}`, { scroll: false });
  }

  function moveLead(lead: LeadSummary, stage: Stage) {
    if (lead.stageId === stage.id) return;
    setProblem(null);
    move.mutate(
      { leadId: lead.id, stageId: stage.id, expectedStageId: lead.stageId },
      {
        onSuccess: () => {
          setAnnouncement(fill(t.board.moved, { name: lead.name, stage: stage.name }));
          if (stage.kind === "won") {
            const burst = Date.now();
            setWin({ burst, name: lead.name, amount: lead.priceMinor > 0 ? formatMoney(lead.priceMinor, board.data?.currency ?? "TRY", locale) : "" });
            window.setTimeout(() => setWin((current) => (current?.burst === burst ? null : current)), 4500);
          }
          if (stage.kind === "lost" && (session.data?.lossReasons.length ?? 0) > 0) setLossFor({ id: lead.id, name: lead.name });
        },
        onError: (error) =>
          setProblem(
            error instanceof ApiError && error.status === 409 ? fill(t.board.moveConflict, { name: lead.name }) : errorText(error, t),
          ),
      },
    );
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const lead = allLeads.find((item) => item.id === event.active.id);
    const stage = stages.find((item) => item.id === event.over?.id);
    if (lead && stage) moveLead(lead, stage);
  }

  const pipelineItems: MenuItem[] = [
    ...pipelines.map(
      (item): MenuItem => ({
        label: item.id === pipeline?.id ? fill(t.pipeline.current, { name: item.name }) : item.name,
        icon: item.id === pipeline?.id ? <Check aria-hidden /> : <span aria-hidden className="size-4" />,
        onSelect: () => switchPipeline(item.isMain ? "main" : item.id),
      }),
    ),
    { kind: "separator" },
    { label: t.pipeline.edit, icon: <Pencil aria-hidden />, onSelect: () => setDialog("editPipeline"), disabled: !pipeline },
    { label: t.pipeline.create, icon: <Plus aria-hidden />, onSelect: () => setDialog("newPipeline") },
  ];

  return (
    <>
      <ScreenHeader
        title={pipeline?.name ?? t.board.title}
        after={
          <Menu
            align="start"
            items={pipelineItems}
            trigger={
              <Button ref={pipelineMenuRef} variant="ghost" size="sm" iconOnly aria-label={t.pipeline.menu} disabled={!session.data}>
                <ChevronDown aria-hidden />
              </Button>
            }
          />
        }
      >
        <nav aria-label={t.board.title} className="flex gap-1">
          <span aria-current="page" className="flex h-8 items-center rounded-md bg-ink px-3 text-sm font-medium text-on-ink">
            {t.board.viewBoard}
          </span>
          <Link
            href={`/w/${ws}/leads`}
            className="flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-strong hover:text-fg"
          >
            {t.board.viewList}
          </Link>
        </nav>
        {isDev ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<FlaskConical aria-hidden />}
            loading={simulate.isPending}
            onClick={() => simulate.mutate({}, { onSuccess: () => setAnnouncement(t.board.simulated) })}
          >
            {t.board.simulate}
          </Button>
        ) : null}
        {mayAdd ? (
          <Button
            ref={addButtonRef}
            variant="primary"
            size="sm"
            icon={<Plus aria-hidden />}
            onClick={() => setDialog("lead")}
            disabled={!session.data || !pipeline}
          >
            {t.board.addLead}
          </Button>
        ) : null}
      </ScreenHeader>

      <FilterBar ws={ws} session={session.data} scope="board" value={filterState} onChange={setFilterState} />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <Confetti burst={win?.burst ?? 0} />
      {win ? (
        <div aria-hidden data-surface="dark" className="motion-block pointer-events-none fixed top-5 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-5 py-3 text-on-ink shadow-modal">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-highlight text-on-highlight">
            <PartyPopper className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-semibold text-highlight">{t.board.wonBanner}</span>
            <span className="truncate font-display text-base font-bold">{[win.name, win.amount].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
      ) : null}

      {problem ? (
        <div className="px-4 pt-3">
          <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
            {problem}
          </Notice>
        </div>
      ) : null}

      {board.isPending ? (
        <div aria-busy className="flex flex-1 gap-4 overflow-hidden bg-ink-raised p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex w-(--layout-board-column) shrink-0 flex-col gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : board.isError || !board.data ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<TriangleAlert />}
            title={missingPipeline ? t.common.notFound : t.common.loadFailed}
            action={
              missingPipeline ? (
                <Button variant="secondary" onClick={() => switchPipeline("main")}>
                  {t.lead.backToBoard}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void board.refetch()}>
                  {t.common.retry}
                </Button>
              )
            }
          />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div data-surface="dark" className="flex min-h-0 flex-1 flex-col bg-ink-raised">
            {totalOpen === 0 ? (
              <div className="px-4 pt-4">
                <div data-surface="light" className="rounded-xl bg-bg">
                  {filtered ? (
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
                      icon={<Inbox />}
                      title={t.board.emptyBoardTitle}
                      body={t.board.emptyBoardBody}
                      action={
                        mayAdd ? (
                          <Button variant="primary" size="sm" icon={<Plus aria-hidden />} onClick={() => setDialog("lead")}>
                            {t.board.addLead}
                          </Button>
                        ) : undefined
                      }
                    />
                  )}
                </div>
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 items-start gap-2 overflow-auto p-3 md:p-4">
              {visible.map((column) => (
                <Column
                  key={column.stage.id}
                  column={column}
                  dragging={activeId !== null}
                  locale={locale}
                  currency={board.data.currency}
                  hint={column.stage.kind === "incoming" ? t.board.incomingHint : undefined}
                >
                  {column.leads.map((lead) => (
                    <BoardCard
                      key={lead.id}
                      ws={ws}
                      lead={lead}
                      stages={stages}
                      currentStage={column.stage}
                      now={now}
                      locale={locale}
                      onMove={moveLead}
                    />
                  ))}
                </Column>
              ))}
            </div>
            {activeId !== null && won && lost ? (
              <div role="group" aria-label={t.board.closeZones} data-surface="light" className="flex shrink-0 gap-3 border-t bg-bg p-3">
                <CloseZone stage={won} label={t.board.dropWon} />
                <CloseZone stage={lost} label={t.board.dropLost} />
              </div>
            ) : null}
          </div>
          <DragOverlay>
            {activeLead ? (
              <div className="w-(--layout-board-column)">
                <LeadCard {...cardProps(activeLead, now, locale, t)} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {session.data && pipeline ? (
        <>
          <NewLeadDialog
            ws={ws}
            session={session.data}
            pipelineId={pipeline.id}
            open={dialog === "lead"}
            onOpenChange={(open) => setDialog(open ? "lead" : null)}
            returnFocusTo={addButtonRef}
          />
          <EditPipelineDialog
            ws={ws}
            session={session.data}
            pipeline={pipeline}
            open={dialog === "editPipeline"}
            onOpenChange={(open) => setDialog(open ? "editPipeline" : null)}
            returnFocusTo={pipelineMenuRef}
          />
        </>
      ) : null}
      <LossReasonDialog ws={ws} lead={lossFor} reasons={session.data?.lossReasons ?? []} onClose={() => setLossFor(null)} />
      <NewPipelineDialog
        ws={ws}
        open={dialog === "newPipeline"}
        onOpenChange={(open) => setDialog(open ? "newPipeline" : null)}
        onCreated={switchPipeline}
        returnFocusTo={pipelineMenuRef}
      />
    </>
  );
}
