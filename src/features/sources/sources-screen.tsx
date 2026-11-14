"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Clock3, Code, Info, Plus, RefreshCw, Trash2, TriangleAlert, UserRoundCheck } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogClose } from "@/components/ui/overlay";
import { Badge, Tag as TagChip } from "@/components/ui/tag";
import { Switch } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { formatAgo } from "@/lib/format";
import { useDeleteIntake, useGoogle, useIntakes, useInspectSheet, useNow, useRotateIntake, useSession, useSheetLinks, useSyncSheetLink, useTags, useUpdateIntake } from "@/lib/hooks";
import type { Intake } from "@/lib/types";
import { PLANNED_SOURCES, READY_SOURCES, sourceOf, type SourceDef } from "./catalog";
import { ConnectForm, SecretPanel, type Secret } from "./connect-dialog";
import { SourceGlyph } from "./source-glyph";
import { pickSpreadsheet, SheetConnect, type SheetDraft } from "./sheet-connect";

/** method: Google Sheets için bağlama yolu (Google hesabı ya da yapıştırılan kod); seçilmeden önce null. */
type Open = { type: "connect"; source: SourceDef; method: "google" | "script" | null } | { type: "secret"; secret: Secret } | { type: "rotate"; intake: Intake } | { type: "delete"; intake: Intake } | null;

/** Kaynağın renkli simgesi. Renk kaynağa aittir (catalog.ts); üstündeki simge beyazdır. */
function Mark({ source, size = "md" }: { source: SourceDef; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={size === "lg" ? "flex size-12 shrink-0 items-center justify-center rounded-lg text-on-accent [&_svg]:size-6" : "flex size-9 shrink-0 items-center justify-center rounded-md text-on-accent [&_svg]:size-4"}
      style={{ backgroundColor: source.tint }}
    >
      <SourceGlyph source={source} />
    </span>
  );
}

/** Bağlanabilen kaynağın karosu: üstte kaynağın rengiyle adı, altta ne işe yaradığı ve eylem. */
function ReadyTile({ source, name, body, action }: { source: SourceDef; name: string; body: string; action: ReactNode }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border bg-bg shadow-card transition-[box-shadow,translate] duration-(--motion-base) hover:-translate-y-0.5 hover:shadow-lift">
      <div className="relative flex h-28 items-end overflow-hidden px-4 pb-3 text-on-accent" style={{ backgroundColor: source.tint }}>
        {/* Süs olarak kırpılan büyük simge yalnız genel simgelerde kullanılır; marka işareti kırpılmaz, bozulmaz. */}
        {source.brand ? null : <SourceGlyph source={source} className="absolute -top-3 -right-3 size-28 opacity-15" strokeWidth={1.25} />}
        {/* Beyaz kutuda işaret markanın kendi rengiyle durur. */}
        <span
          aria-hidden
          className={cn("absolute top-3 left-4 flex items-center justify-center rounded-md bg-bg", source.brand ? "size-11 [&_svg]:size-6" : "size-9 [&_svg]:size-5")}
          style={{ color: source.brand?.hex ?? source.tint }}
        >
          <SourceGlyph source={source} />
        </span>
        <h3 className="relative text-lg text-on-accent">{name}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <p className="text-sm text-muted">{body}</p>
        <div className="mt-auto">{action}</div>
      </div>
    </li>
  );
}

export function SourcesScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const connectedId = useId();
  const readyId = useId();
  const channelsId = useId();
  const session = useSession(ws);
  const tags = useTags(ws);
  const intakes = useIntakes(ws);
  const update = useUpdateIntake(ws);
  const rotate = useRotateIntake(ws);
  const remove = useDeleteIntake(ws);
  const now = useNow();
  const google = useGoogle(ws);
  const links = useSheetLinks(ws);
  const syncLink = useSyncSheetLink(ws);
  const inspectPicked = useInspectSheet(ws);
  const router = useRouter();
  const params = useSearchParams();
  // Google izin ekranından dönüş: ?google=<hesap> bağlama penceresini kaldığı yerden açar, ?google_error nedeni söyler.
  const returnedAccount = params.get("google");
  const returnedError = params.get("google_error") as keyof typeof t.sheets.returned | null;
  const [open, setOpen] = useState<Open>(() => (returnedAccount ? { type: "connect", source: sourceOf("google_sheets"), method: "google" } : null));
  const [sheetDraft, setSheetDraft] = useState<SheetDraft>({ accountId: returnedAccount, inspection: null });
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(returnedError ? (t.sheets.returned[returnedError] ?? t.sheets.returned.failed) : null);
  const [flash, setFlash] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (returnedAccount || returnedError) router.replace(`/w/${ws}/sources`);
  }, [returnedAccount, returnedError, router, ws]);

  if (session.isPending) {
    return (
      <>
        <ScreenHeader title={t.sources.title} />
        <div aria-busy className="flex flex-col gap-3 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </>
    );
  }
  if (!session.data) {
    return (
      <>
        <ScreenHeader title={t.sources.title} />
        <EmptyState
          icon={<TriangleAlert />}
          title={t.common.loadFailed}
          action={
            <Button variant="primary" onClick={() => void session.refetch()}>
              {t.common.retry}
            </Button>
          }
        />
      </>
    );
  }

  const canEdit = session.data.user.isAdmin;
  const pipelines = session.data.pipelines;
  const mainPipeline = pipelines.find((item) => item.isMain) ?? pipelines[0];
  const allStages = pipelines.flatMap((item) => item.stages);
  const leadTags = tags.data ?? [];
  const connected = intakes.data ?? [];

  const show = (next: Open, element?: HTMLElement) => {
    if (element) trigger.current = element;
    setProblem(null);
    setFlash(null);
    if (next?.type === "connect") setSheetDraft({ accountId: null, inspection: null });
    setOpen(next);
  };
  const sheetLinks = links.data ?? [];
  const problemText = (code: string) => (t.sheets.problems as Record<string, string>)[code] ?? code;

  // Google'ın dosya seçicisi sayfanın üstünde ayrı bir katmanda açılır; bizim penceremiz o sırada kapanır.
  async function pickWithGoogle(accountId: string) {
    if (!google.data) return;
    setPicking(true);
    try {
      const doc = await pickSpreadsheet(ws, accountId, google.data);
      if (doc) setSheetDraft({ accountId, inspection: await inspectPicked.mutateAsync({ accountId, spreadsheetId: doc.id }) });
    } catch (error) {
      setProblem(error instanceof Error && !("status" in error) ? t.sheets.pickerFailed : errorText(error, t));
    } finally {
      setPicking(false);
    }
  }
  const fail = (error: unknown) => setProblem(errorText(error, t));
  const nameOf = (source: SourceDef) => t.sources.items[source.id].name;

  const title =
    open?.type === "connect"
      ? fill(t.sources.dialogTitle, { name: nameOf(open.source) })
      : open?.type === "secret"
        ? t.intakes.secretTitle
        : open?.type === "rotate"
          ? t.intakes.rotateTitle
          : t.intakes.removeTitle;
  const description =
    open?.type === "secret" ? open.secret.intake.name : open?.type === "rotate" ? t.intakes.rotateBody : open?.type === "delete" ? t.intakes.removeBody : open?.type === "connect" ? t.sources.items[open.source.id].body : undefined;

  return (
    <>
      <ScreenHeader title={t.sources.title} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-6 md:px-8 md:py-8">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 className="font-display text-xl text-balance text-fg">{t.sources.lead}</h2>
            <p className="text-base text-pretty text-muted">{t.sources.body}</p>
          </div>

          {canEdit ? null : (
            <Notice tone="info" icon={<Info aria-hidden />}>
              {t.sources.adminOnly}
            </Notice>
          )}
          {problem && !open ? (
            <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
              {problem}
            </Notice>
          ) : null}
          {flash && !open ? (
            <div role="status">
              <Notice tone="info" icon={<Info aria-hidden />}>
                {flash}
              </Notice>
            </div>
          ) : null}

          <section aria-labelledby={connectedId} className="flex flex-col gap-3">
            <h2 id={connectedId} className="text-base font-semibold text-fg">
              {t.sources.connectedTitle}
            </h2>
            {intakes.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : connected.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-input bg-bg px-4 py-5 text-sm text-muted">{t.intakes.none}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border bg-bg shadow-card">
                {connected.map((intake) => {
                  const stage = allStages.find((item) => item.id === intake.stageId);
                  const tag = leadTags.find((item) => item.id === intake.tagId);
                  const source = sourceOf(intake.provider);
                  const link = sheetLinks.find((item) => item.intakeId === intake.id);
                  return (
                    <li key={intake.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
                      <Mark source={source} />
                      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                          <span className="break-words">{intake.name}</span>
                          <Badge>{nameOf(source)}</Badge>
                          {tag ? <TagChip color={tag.color}>{tag.name}</TagChip> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {stage ? fill(t.intakes.target, { stage: stage.name }) : null}
                          {" · "}
                          {intake.lastReceivedAt ? fill(t.intakes.lastReceived, { time: formatAgo(intake.lastReceivedAt, now, t.time) }) : t.intakes.never}
                        </p>
                        {link ? (
                          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span className="break-words">{fill(t.sheets.linkLine, { email: link.email, spreadsheet: link.spreadsheetName, tab: link.sheetTitle })}</span>
                            <span title={link.watching ? t.sheets.liveHint : t.sheets.pollingHint}>
                              <Badge tone={link.watching ? "success" : "neutral"}>{link.watching ? t.sheets.live : t.sheets.polling}</Badge>
                            </span>
                          </p>
                        ) : null}
                        {link?.lastError ? <p className="text-xs break-words text-danger">{problemText(link.lastError)}</p> : null}
                        {intake.lastError ? <p className="text-xs break-words text-danger">{fill(t.intakes.lastError, { error: intake.lastError })}</p> : null}
                      </div>
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={intake.isActive}
                            disabled={update.isPending}
                            aria-label={fill(t.intakes.activeLabel, { name: intake.name })}
                            onCheckedChange={(checked) => update.mutate({ id: intake.id, isActive: checked }, { onError: fail })}
                          />
                          {link ? (
                            // Google hesabıyla bağlı tabloda gizli adres yoktur; yerine elle eşitleme vardır.
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<RefreshCw aria-hidden />}
                              loading={syncLink.isPending && syncLink.variables === link.id}
                              aria-label={fill(t.sheets.syncLabel, { name: intake.name })}
                              onClick={() => {
                                setProblem(null);
                                setFlash(null);
                                syncLink.mutate(link.id, {
                                  onSuccess: (result) => (result.error ? setProblem(problemText(result.error)) : setFlash(result.created > 0 ? fill(t.sheets.synced, { count: result.created }) : t.sheets.syncedNone)),
                                  onError: fail,
                                });
                              }}
                            >
                              {t.sheets.syncNow}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={<RefreshCw aria-hidden />}
                              aria-label={fill(t.intakes.rotateLabel, { name: intake.name })}
                              onClick={(event) => show({ type: "rotate", intake }, event.currentTarget)}
                            >
                              {t.intakes.rotate}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" iconOnly aria-label={fill(t.intakes.remove, { name: intake.name })} onClick={(event) => show({ type: "delete", intake }, event.currentTarget)}>
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby={readyId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={readyId} className="text-base font-semibold text-fg">
                {t.sources.readyTitle}
              </h2>
              <p className="text-sm text-muted">{t.sources.readyBody}</p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {READY_SOURCES.map((source) => {
                const name = nameOf(source);
                const action =
                  source.action.type === "import" ? (
                    canEdit ? (
                      <Link href={`/w/${ws}/leads?import=1`} aria-label={fill(t.sources.openImportLabel, { name })} className={buttonClass({ className: "w-full" })}>
                        {t.sources.openImport}
                        <ArrowUpRight aria-hidden />
                      </Link>
                    ) : null
                  ) : canEdit ? (
                    <Button
                      variant="primary"
                      className="w-full"
                      icon={<Plus aria-hidden />}
                      aria-label={fill(t.sources.connectLabel, { name })}
                      onClick={(event) => show({ type: "connect", source, method: null }, event.currentTarget)}
                    >
                      {t.sources.connect}
                    </Button>
                  ) : null;
                return <ReadyTile key={source.id} source={source} name={name} body={t.sources.items[source.id].body} action={action} />;
              })}
            </ul>
          </section>

          <section aria-labelledby={channelsId} className="flex flex-col gap-4">
            <div className="flex max-w-2xl flex-col gap-1">
              <h2 id={channelsId} className="text-base font-semibold text-fg">
                {t.sources.channelsTitle}
              </h2>
              <p className="text-sm text-muted">{t.sources.channelsBody}</p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
              {PLANNED_SOURCES.map((source) => {
                const item = t.sources.items[source.id];
                return (
                  <li key={source.id} className="flex items-start gap-3 rounded-lg border bg-bg p-4">
                    <Mark source={source} size="lg" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-fg">{item.name}</span>
                        <Badge icon={<Clock3 aria-hidden />}>{t.sources.planned}</Badge>
                      </p>
                      <p className="text-sm text-muted">{item.body}</p>
                      {"need" in item ? <p className="text-xs text-muted">{item.need}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <Dialog
        title={title}
        description={description}
        closeLabel={t.common.close}
        open={open !== null && !picking}
        onOpenChange={(next) => (next ? undefined : setOpen(null))}
        returnFocusTo={trigger}
        footer={
          open?.type === "rotate" || open?.type === "delete" ? (
            <>
              <DialogClose asChild>
                <Button variant="ghost">{t.common.cancel}</Button>
              </DialogClose>
              {open.type === "rotate" ? (
                <Button variant="primary" loading={rotate.isPending} onClick={() => rotate.mutate(open.intake.id, { onSuccess: (secret) => setOpen({ type: "secret", secret }), onError: fail })}>
                  {t.intakes.rotateConfirm}
                </Button>
              ) : (
                <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(open.intake.id, { onSuccess: () => setOpen(null), onError: fail })}>
                  {t.intakes.removeConfirm}
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {open?.type === "connect" && open.source.id === "google_sheets" && google.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : open?.type === "connect" && open.source.id === "google_sheets" && google.data?.configured && open.method === null ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg">{t.sheets.methodTitle}</h3>
            {(
              [
                { method: "google", icon: <UserRoundCheck aria-hidden />, title: t.sheets.methodGoogle, body: t.sheets.methodGoogleBody, recommended: true },
                { method: "script", icon: <Code aria-hidden />, title: t.sheets.methodScript, body: t.sheets.methodScriptBody, recommended: false },
              ] as const
            ).map((option) => (
              <button
                key={option.method}
                type="button"
                onClick={() => setOpen({ ...open, method: option.method })}
                className="flex items-start gap-3 rounded-lg border border-border-input bg-bg p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-4">
                  {option.icon}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                    {option.title}
                    {option.recommended ? <Badge tone="success">{t.sheets.recommended}</Badge> : null}
                  </span>
                  <span className="text-sm text-muted">{option.body}</span>
                </span>
              </button>
            ))}
          </div>
        ) : open?.type === "connect" && open.source.id === "google_sheets" && google.data?.configured && open.method === "google" && mainPipeline ? (
          <SheetConnect
            ws={ws}
            google={google.data}
            draft={sheetDraft}
            onDraft={setSheetDraft}
            onPickWithGoogle={(accountId) => void pickWithGoogle(accountId)}
            pipelines={pipelines}
            defaultPipelineId={mainPipeline.id}
            tags={leadTags}
            defaultName={fill(t.sources.defaultName, { name: nameOf(open.source) })}
            onDone={() => setOpen(null)}
            onCancel={() => setOpen(null)}
          />
        ) : open?.type === "connect" && open.source.action.type === "intake" && mainPipeline ? (
          <ConnectForm
            ws={ws}
            action={open.source.action}
            sourceName={nameOf(open.source)}
            pipelines={pipelines}
            defaultPipelineId={mainPipeline.id}
            tags={leadTags}
            onCreated={(secret) => setOpen({ type: "secret", secret })}
            onCancel={() => setOpen(null)}
          />
        ) : open?.type === "secret" ? (
          <SecretPanel secret={open.secret} onDone={() => setOpen(null)} />
        ) : open?.type === "rotate" || open?.type === "delete" ? (
          <>
            <p className="text-sm font-medium text-fg">{open.intake.name}</p>
            {problem ? (
              <p role="alert" className="pt-2 text-xs text-danger">
                {problem}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>
    </>
  );
}
