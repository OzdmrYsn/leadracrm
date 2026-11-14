"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ellipsis, MessageSquare, Plus, Trash2, TriangleAlert, UserRoundPlus } from "lucide-react";
import { InlineField } from "@/components/app/inline-field";
import { ScreenHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogClose, Menu } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Badge, Tag } from "@/components/ui/tag";
import { Composer } from "@/features/chat/composer";
import { Feed } from "@/features/chat/feed";
import { IncomingPanel } from "@/features/chat/incoming-panel";
import { CompanyBlock } from "@/features/companies/company-block";
import { ContactPicker } from "@/features/contacts/contact-picker";
import { CustomFields } from "@/features/fields/custom-fields";
import { TagPicker } from "@/features/tags/tag-picker";
import { TasksSection } from "@/features/tasks/tasks-section";
import { fill, useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatDateTime, formatMoney, parseMoney } from "@/lib/format";
import {
  useAddNote,
  useDeleteLead,
  useLead,
  useLeadFeed,
  useMarkRead,
  useNow,
  useSendMessage,
  useSession,
  useSetLeadTags,
  useUpdateLead,
} from "@/lib/hooks";
import { can } from "@/lib/rights";
import type { Id } from "@/lib/types";

const UNASSIGNED = "none";
const NO_REASON = "none";

export function LeadScreen({ ws, leadId }: { ws: string; leadId: Id }) {
  const { t } = useI18n();
  const router = useRouter();
  const session = useSession(ws);
  const detail = useLead(ws, leadId);
  const feed = useLeadFeed(ws, leadId);
  const update = useUpdateLead(ws, leadId);
  const setTags = useSetLeadTags(ws, leadId);
  const remove = useDeleteLead(ws);
  const addNote = useAddNote(ws, leadId);
  const markRead = useMarkRead(ws);
  const now = useNow();
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);

  const conversation = detail.data?.conversation ?? null;
  const conversationId = conversation?.id ?? null;
  const unread = conversation?.unreadCount ?? 0;
  const send = useSendMessage(ws, conversationId, session.data?.user.name ?? "", leadId);
  const markReadMutate = markRead.mutate;

  // Kart açıkken gelen mesajlar okunmuş sayılır.
  useEffect(() => {
    if (conversationId && unread > 0) markReadMutate(conversationId);
  }, [conversationId, unread, markReadMutate]);

  const boardHref = `/w/${ws}/pipelines`;
  const back = (
    <Link
      href={boardHref}
      aria-label={t.lead.backToBoard}
      title={t.lead.backToBoard}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-strong"
    >
      <ArrowLeft aria-hidden className="size-4" />
    </Link>
  );

  if (detail.isPending || session.isPending) {
    return (
      <>
        <ScreenHeader title={t.common.loading} before={back} />
        <div aria-busy className="flex flex-col gap-3 p-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-2/3" />
        </div>
      </>
    );
  }

  if (detail.isError || session.isError || !detail.data || !session.data) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <>
        <ScreenHeader title={t.nav.leads} before={back} />
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<TriangleAlert />}
            title={missing ? t.common.notFound : t.common.loadFailed}
            action={
              missing ? (
                <Link href={boardHref} className="text-sm font-medium text-fg underline underline-offset-4">
                  {t.lead.backToBoard}
                </Link>
              ) : (
                <Button variant="secondary" onClick={() => void detail.refetch()}>
                  {t.common.retry}
                </Button>
              )
            }
          />
        </div>
      </>
    );
  }

  const { lead, stage, pipeline, contact, company, tags, responsible } = detail.data;
  const { workspace, users, user } = session.data;
  const isIncoming = stage.kind === "incoming";
  const mayEdit = can(session.data, "leads", "edit", lead.responsibleUserId);
  const mayDelete = can(session.data, "leads", "delete", lead.responsibleUserId);
  const tagIds = tags.map((tag) => tag.id);

  function save(input: Parameters<typeof update.mutateAsync>[0]) {
    setProblem(null);
    return update.mutateAsync(input).catch((error: unknown) => {
      setProblem(error instanceof ApiError && error.status === 409 ? t.lead.stageConflict : errorText(error, t));
      throw error;
    });
  }

  function saveTags(next: Id[]) {
    setProblem(null);
    setTags.mutate(next, { onError: (error) => setProblem(errorText(error, t)) });
  }

  function deleteLead() {
    remove.mutate(lead.id, {
      onSuccess: () => router.replace(lead.pipelineId === session.data?.pipelines.find((item) => item.isMain)?.id ? boardHref : `${boardHref}?p=${lead.pipelineId}`),
      onError: (error) => setProblem(errorText(error, t)),
    });
  }

  const stageOptions = pipeline.stages
    .filter((item) => item.kind !== "incoming" || item.id === stage.id)
    .sort((a, b) => a.sort - b.sort)
    .map((item) => ({
      value: item.id,
      label: item.name,
      swatch: `--stage-${item.color}`,
      disabled: item.kind === "incoming",
    }));

  return (
    <>
      <ScreenHeader title={lead.name} before={back}>
        {isIncoming ? <Badge tone="info">{t.lead.incoming}</Badge> : null}
        {stage.kind === "won" ? <Badge tone="success">{t.lead.closedWon}</Badge> : null}
        {stage.kind === "lost" ? <Badge tone="danger">{t.lead.closedLost}</Badge> : null}
        {mayDelete ? (
          <Menu
            items={[{ label: t.leadMenu.delete, icon: <Trash2 aria-hidden />, danger: true, onSelect: () => setConfirmDelete(true) }]}
            trigger={
              <Button ref={menuRef} variant="ghost" size="sm" iconOnly aria-label={t.leadMenu.label}>
                <Ellipsis aria-hidden />
              </Button>
            }
          />
        ) : null}
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[var(--layout-record-panel)_minmax(0,1fr)] lg:overflow-hidden">
        <section aria-label={t.lead.details} className="flex flex-col gap-2 border-b bg-bg p-3 lg:overflow-y-auto lg:border-r lg:border-b-0">
          {!mayEdit ? <Notice tone="info">{t.lead.readOnly}</Notice> : null}
          {problem ? (
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
              {problem}
            </Notice>
          ) : null}

          <InlineField
            label={t.lead.name}
            value={lead.name}
            display={lead.name}
            validate={(next) => (next.trim() === "" ? t.newLead.nameRequired : null)}
            onSave={(next) => save({ name: next })}
          />
          <InlineField
            label={t.lead.price}
            value={lead.priceMinor === 0 ? "" : String(lead.priceMinor / 100).replace(".", ",")}
            display={formatMoney(lead.priceMinor, lead.currency, workspace.locale)}
            inputMode="decimal"
            strong
            validate={(next) => (parseMoney(next) === null ? t.newLead.priceInvalid : null)}
            onSave={(next) => save({ priceMinor: parseMoney(next) ?? 0 })}
          />

          <div className="flex flex-col gap-1 px-2 py-1">
            <label htmlFor="lead-stage" className="text-xs text-muted">
              {t.lead.stage}
            </label>
            <Select
              id="lead-stage"
              value={stage.id}
              disabled={update.isPending}
              options={stageOptions}
              onValueChange={(next) => void save({ stageId: next, expectedStageId: stage.id }).catch(() => undefined)}
            />
          </div>

          {stage.kind === "lost" && session.data.lossReasons.length > 0 ? (
            <div className="flex flex-col gap-1 px-2 py-1">
              <label htmlFor="lead-loss-reason" className="text-xs text-muted">
                {t.lead.lossReason}
              </label>
              <Select
                id="lead-loss-reason"
                value={lead.lossReasonId ?? NO_REASON}
                disabled={update.isPending}
                options={[{ value: NO_REASON, label: t.lead.noLossReason }, ...session.data.lossReasons.map((reason) => ({ value: reason.id, label: reason.name }))]}
                onValueChange={(next) => void save({ lossReasonId: next === NO_REASON ? null : next }).catch(() => undefined)}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1 px-2 py-1">
            <label htmlFor="lead-responsible" className="text-xs text-muted">
              {t.lead.responsible}
            </label>
            <Select
              id="lead-responsible"
              value={responsible?.id ?? UNASSIGNED}
              disabled={update.isPending}
              options={[...users.map((user) => ({ value: user.id, label: user.name })), { value: UNASSIGNED, label: t.common.unassigned }]}
              onValueChange={(next) => void save({ responsibleUserId: next === UNASSIGNED ? null : next }).catch(() => undefined)}
            />
          </div>

          <TasksSection ws={ws} session={session.data} target={{ kind: "lead", id: lead.id, name: lead.name }} now={now} variant="panel" />

          <div className="flex flex-col gap-3 px-2 py-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-xs text-muted">{t.lead.contact}</h2>
              {contact ? (
                <div className="flex flex-col gap-2">
                  <div className="text-sm text-fg">
                    <p className="font-medium">
                      <Link href={`/w/${ws}/contacts/${contact.id}`} className="rounded-sm underline underline-offset-4">
                        {contact.name}
                      </Link>
                    </p>
                    {contact.company && contact.companyId !== lead.companyId ? <p className="text-muted">{contact.company}</p> : null}
                    {contact.handles.map((handle) => (
                      <p key={`${handle.kind}-${handle.value}`} className="break-words text-muted">
                        {handle.kind === "telegram" || handle.kind === "whatsapp" ? `${t.chat.channel[handle.kind]}: ` : ""}
                        {handle.value}
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ContactPicker
                      ws={ws}
                      locale={workspace.locale}
                      onPick={(contactId) => save({ contactId })}
                      trigger={
                        <Button size="sm" disabled={update.isPending}>
                          {t.contact.change}
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={update.isPending}
                      aria-label={fill(t.contact.unlinkLabel, { name: contact.name })}
                      onClick={() => void save({ contactId: null }).catch(() => undefined)}
                    >
                      {t.contact.unlink}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-muted">{t.lead.noContact}</p>
                  <ContactPicker
                    ws={ws}
                    locale={workspace.locale}
                    onPick={(contactId) => save({ contactId })}
                    trigger={
                      <Button size="sm" icon={<UserRoundPlus aria-hidden />}>
                        {t.contact.link}
                      </Button>
                    }
                  />
                </div>
              )}
            </div>

            <CompanyBlock ws={ws} locale={workspace.locale} company={company} disabled={update.isPending} onChange={(companyId) => save({ companyId })} />

            <div className="flex flex-col gap-1">
              <h2 className="text-xs text-muted">{t.lead.tags}</h2>
              <div className="flex flex-wrap items-center gap-1">
                {tags.map((tag) => (
                  <Tag
                    key={tag.id}
                    color={tag.color}
                    removeLabel={fill(t.tags.remove, { name: tag.name })}
                    onRemove={() => saveTags(tagIds.filter((id) => id !== tag.id))}
                  >
                    {tag.name}
                  </Tag>
                ))}
                <TagPicker
                  ws={ws}
                  selectedIds={tagIds}
                  onChange={saveTags}
                  trigger={
                    <Button variant="ghost" size="sm" icon={<Plus aria-hidden />}>
                      {t.tags.add}
                    </Button>
                  }
                />
              </div>
            </div>

          </div>

          <CustomFields
            ws={ws}
            entityType="lead"
            values={lead.custom}
            locale={workspace.locale}
            canManage={user.isAdmin}
            onSave={(patch) => save({ custom: patch })}
          />

          <div className="px-2 py-1">
            <h2 className="text-xs text-muted">{t.lead.created}</h2>
            <p className="text-sm text-fg">
              <time dateTime={lead.createdAt}>{formatDateTime(lead.createdAt, workspace.locale, workspace.timezone)}</time>
            </p>
          </div>
        </section>

        <section aria-label={t.lead.feed} className="flex min-h-96 min-w-0 flex-col lg:min-h-0">
          <div className="flex-1 overflow-y-auto p-4">
            {feed.isPending ? (
              <div aria-busy className="flex flex-col gap-3">
                <Skeleton className="h-12 w-2/3" />
                <Skeleton className="ml-auto h-12 w-1/2" />
              </div>
            ) : feed.data && feed.data.length > 0 ? (
              <Feed items={feed.data} now={now} locale={workspace.locale} timeZone={workspace.timezone} label={t.lead.feed} />
            ) : (
              <EmptyState icon={<MessageSquare />} title={t.lead.emptyFeedTitle} body={t.lead.emptyFeedBody} />
            )}
          </div>
          {isIncoming && conversation ? (
            <IncomingPanel
              ws={ws}
              leadId={lead.id}
              contactName={conversation.contactName}
              channel={conversation.channel.kind}
              onDeclined={() => router.replace(boardHref)}
              onLinked={(targetLeadId) => router.replace(`/w/${ws}/leads/${targetLeadId}`)}
            />
          ) : null}
          <Composer
            onSend={conversationId ? (body) => send.mutateAsync({ body, clientToken: crypto.randomUUID() }) : undefined}
            onNote={(body) => addNote.mutateAsync(body)}
          />
        </section>
      </div>

      <Dialog
        title={t.leadMenu.deleteTitle}
        description={t.leadMenu.deleteBody}
        closeLabel={t.common.close}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        returnFocusTo={menuRef}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">{t.common.cancel}</Button>
            </DialogClose>
            <Button variant="danger" loading={remove.isPending} onClick={deleteLead}>
              {t.leadMenu.deleteConfirm}
            </Button>
          </>
        }
      >
        <p className="text-sm font-medium text-fg">{lead.name}</p>
      </Dialog>
    </>
  );
}
