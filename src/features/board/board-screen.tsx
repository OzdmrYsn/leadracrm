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
import { ArrowDown, ArrowUp, Check, ChevronDown, Ellipsis, FlaskConical, Funnel, Inbox, PartyPopper, Pencil, Plus, TriangleAlert } from "lucide-react";
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
import { keys, useBoard, useDebounced, useMoveLead, useNow, useReorderPipelines, useSession, useSimulateInbound } from "@/lib/hooks";
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
    avatarName: lead.contactName ?? undefined,
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
  quickAdd,
}: {
  column: BoardColumn;
  children: ReactNode;
  hint?: string;
  dragging: boolean;
  locale: string;
  currency: string;
  /** Sütunun başındaki hızlı ekleme düğmesi (yalnız ilk açık aşamada). */
  quickAdd?: ReactNode;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id, disabled: column.stage.kind === "incoming" });
  return (
    <section
      ref={setNodeRef}
      aria-label={column.stage.name}
      className={cn(
        "flex w-(--layout-board-column) shrink-0 flex-col gap-2 rounded-md p-1.5 transition-colors",
        isOver && "bg-accent-soft ring-2 ring-accent",
        dragging && !isOver && column.stage.kind !== "incoming" && "ring-1 ring-border-input",
      )}
    >
      <StageHeader
        name={column.stage.name}
        color={column.stage.color}
        countLabel={fill(t.board.leadCount, { count: column.count })}
        total={column.totalMinor > 0 ? formatMoney(column.totalMinor, currency, locale) : undefined}
      />
      {hint ? <p className="px-1 text-center text-xs text-muted">{hint}</p> : null}
      {quickAdd}
      {column.leads.length > 0 ? (
        <ul className="flex flex-col gap-2">{children}</ul>
      ) : (
        <p className="rounded-md border border-dashed border-border-input px-3 py-6 text-center text-sm text-muted">{t.board.emptyColumn}</p>
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
  const reorder = useReorderPipelines(ws);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"lead" | "newPipeline" | "editPipeline" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [lossFor, setLossFor] = useState<{ id: string; name: string } | null>(null);
  // Kazanılan satışın kutlaması: renkli bloklar ve kısa bir şerit. Süstür; duyuru aşağıdaki durum satırından yapılır.
  const [win, setWin] = useState<{ burst: number; name: string; amount: string } | null>(null);
  // Sütundan hızlı ekleme: pencere o aşama seçili açılır, kapanınca odak sütundaki düğmeye döner.
  const [quickStage, setQuickStage] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const quickAddRef = useRef<HTMLButtonElement>(null);
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
  const firstOpenId = stages.find((stage) => stage.kind === "open")?.id;
  const won = stages.find((stage) => stage.kind === "won");
  const lost = stages.find((stage) => stage.kind === "lost");
  const totalOpen = visible.reduce((sum, column) => sum + column.count, 0);
  const open = columns.filter((column) => column.stage.kind === "open");
  const openCount = open.reduce((sum, column) => sum + column.count, 0);
  const openMinor = open.reduce((sum, column) => sum + column.totalMinor, 0);
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

  // Seçili pipeline'ı listede bir sıra oynatır. Ana pipeline her zaman baştadır; yalnız diğerleri yer değiştirir.
  const others = pipelines.filter((item) => !item.isMain);
  const place = others.findIndex((item) => item.id === pipeline?.id);
  function shiftPipeline(step: -1 | 1) {
    const target = place + step;
    if (!pipeline || place < 0 || target < 0 || target >= others.length) return;
    const next = [...others];
    [next[place], next[target]] = [next[target], next[place]];
    setProblem(null);
    reorder.mutate([...pipelines.filter((item) => item.isMain), ...next].map((item) => item.id), {
      onSuccess: () => setAnnouncement(fill(t.pipeline.reordered, { name: pipeline.name, position: target + 2 })),
      onError: (error) => setProblem(errorText(error, t)),
    });
  }
  const orderItems: MenuItem[] =
    session.data?.user.isAdmin && place >= 0 && others.length > 1
      ? [
          { label: t.pipeline.listUp, icon: <ArrowUp aria-hidden />, onSelect: () => shiftPipeline(-1), disabled: place === 0 },
          { label: t.pipeline.listDown, icon: <ArrowDown aria-hidden />, onSelect: () => shiftPipeline(1), disabled: place === others.length - 1 },
        ]
      : [];

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
    ...orderItems,
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
        {board.data && openCount > 0 ? (
          <p className="hidden pr-2 text-sm text-muted xl:block">
            {fill(t.board.summary, { count: openCount })}
            {openMinor > 0 ? (
              <>
                {" · "}
                <span className="font-semibold text-fg tabular-nums">{formatMoney(openMinor, board.data.currency, locale)}</span>
              </>
            ) : null}
          </p>
        ) : null}
        <nav aria-label={t.board.title} className="flex gap-1">
          <span aria-current="page" className="flex h-8 items-center rounded-md bg-accent-soft px-3 text-sm font-semibold text-accent">
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
            onClick={() => {
              setQuickStage(null);
              setDialog("lead");
            }}
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
        <div aria-hidden data-surface="dark" className="motion-block pointer-events-none fixed top-5 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg bg-ink px-5 py-3 text-on-ink shadow-modal">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-highlight text-on-highlight">
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
        <div aria-busy className="flex flex-1 gap-4 overflow-hidden p-4">
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
          <div className="flex min-h-0 flex-1 flex-col">
            {totalOpen === 0 ? (
              <div className="px-4 pt-4">
                <div className="rounded-lg border bg-bg">
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
            <div className="flex min-h-0 flex-1 items-start gap-2 overflow-auto px-2 py-4 md:px-3">
              {visible.map((column) => (
                <Column
                  key={column.stage.id}
                  column={column}
                  dragging={activeId !== null}
                  locale={locale}
                  currency={board.data.currency}
                  hint={column.stage.kind === "incoming" ? t.board.incomingHint : undefined}
                  quickAdd={
                    mayAdd && column.stage.id === firstOpenId ? (
                      <button
                        ref={quickAddRef}
                        type="button"
                        aria-label={fill(t.board.quickAddLabel, { stage: column.stage.name })}
                        onClick={() => {
                          setQuickStage(column.stage.id);
                          setDialog("lead");
                        }}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-input text-sm font-medium text-muted transition-colors hover:border-accent hover:bg-bg hover:text-accent"
                      >
                        <Plus aria-hidden className="size-4" />
                        {t.board.quickAdd}
                      </button>
                    ) : undefined
                  }
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
              <div role="group" aria-label={t.board.closeZones} className="flex shrink-0 gap-3 border-t bg-bg p-3">
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
            stageId={quickStage ?? undefined}
            open={dialog === "lead"}
            onOpenChange={(open) => setDialog(open ? "lead" : null)}
            returnFocusTo={quickStage ? quickAddRef : addButtonRef}
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
