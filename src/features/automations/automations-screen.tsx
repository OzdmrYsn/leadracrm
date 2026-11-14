"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Cable, Info, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Dialog, DialogClose } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Badge, Tag as TagChip } from "@/components/ui/tag";
import { Switch } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useAutomations, useDeleteAutomation, useSession, useTags, useUpdateAutomation } from "@/lib/hooks";
import type { Automation, Id, Stage } from "@/lib/types";
import { AutomationDialog } from "./automation-dialog";
import { describeAction, type Lookup } from "./summary";

type Editing = { stage: Stage; automation?: Automation } | null;

export function AutomationsScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const headingId = useId();
  const session = useSession(ws);
  const tags = useTags(ws);
  const [pipelineId, setPipelineId] = useState<Id | null>(null);
  const pipelines = session.data?.pipelines ?? [];
  const pipeline = pipelines.find((item) => item.id === pipelineId) ?? pipelines.find((item) => item.isMain) ?? pipelines[0];
  const automations = useAutomations(ws, pipeline?.id);
  const update = useUpdateAutomation(ws);
  const remove = useDeleteAutomation(ws);

  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<{ automation: Automation; summary: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  if (session.isPending) {
    return (
      <>
        <ScreenHeader title={t.automations.title} />
        <div aria-busy className="flex flex-col gap-3 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }
  if (!session.data || !pipeline) {
    return (
      <>
        <ScreenHeader title={t.automations.title} />
        <EmptyState
          icon={<TriangleAlert />}
          title={t.common.loadFailed}
          action={
            <Button variant="secondary" onClick={() => void session.refetch()}>
              {t.common.retry}
            </Button>
          }
        />
      </>
    );
  }

  const canEdit = session.data.user.isAdmin;
  const stages = pipeline.stages.slice().sort((a, b) => a.sort - b.sort);
  const lookup: Lookup = { users: session.data.users, stages: pipeline.stages, tags: tags.data ?? [], taskTypes: session.data.taskTypes };
  const fail = (error: unknown) => setProblem(errorText(error, t));

  return (
    <>
      <ScreenHeader title={t.automations.title}>
        {pipelines.length > 1 ? (
          <Select
            aria-label={t.automations.pipelineLabel}
            value={pipeline.id}
            onValueChange={setPipelineId}
            className="h-8 w-56"
            options={pipelines.map((item) => ({ value: item.id, label: item.name }))}
          />
        ) : null}
      </ScreenHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-4">
        {canEdit ? null : (
          <Notice tone="info" icon={<Info aria-hidden />}>
            {t.automations.adminOnly}
          </Notice>
        )}
        {problem ? (
          <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
            {problem}
          </Notice>
        ) : null}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-bg px-4 py-3 text-sm text-fg shadow-card">
          <Cable aria-hidden className="size-4 shrink-0 text-accent" />
          <span>{t.sources.fromAutomations}</span>
          <Link href={`/w/${ws}/sources`} className="inline-flex items-center gap-1 font-medium text-accent underline-offset-4 hover:underline">
            {t.sources.fromAutomationsLink}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </p>

        <section aria-labelledby={headingId} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="text-base font-semibold text-fg">
              {t.automations.triggersTitle}
            </h2>
            <p className="text-sm text-muted">{t.automations.triggersBody}</p>
          </div>
          {automations.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {stages.map((stage) => {
                const list = (automations.data ?? []).filter((item) => item.stageId === stage.id);
                return (
                  <li key={stage.id} className="flex flex-col overflow-clip rounded-lg border bg-bg shadow-card">
                    <div className="flex min-h-12 items-center justify-between gap-2 border-b bg-surface px-3 py-2">
                      <h3 className="min-w-0">
                        <TagChip color={stage.color}>{stage.name}</TagChip>
                      </h3>
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Plus aria-hidden />}
                          aria-label={fill(t.automations.addFor, { stage: stage.name })}
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setEditing({ stage });
                          }}
                        >
                          {t.automations.add}
                        </Button>
                      ) : null}
                    </div>
                    {list.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-muted">{t.automations.none}</p>
                    ) : (
                      <ul className="flex flex-col divide-y">
                        {list.map((automation) => {
                          const summary = describeAction(automation, lookup, t);
                          return (
                            <li key={automation.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                              <Badge>{t.automations.eventShort[automation.onEvent]}</Badge>
                              <span className={automation.isActive ? "min-w-0 flex-1 basis-40 text-sm break-words text-fg" : "min-w-0 flex-1 basis-40 text-sm break-words text-muted"}>
                                {summary}
                              </span>
                              {canEdit ? (
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={automation.isActive}
                                    disabled={update.isPending}
                                    aria-label={fill(t.automations.activeLabel, { summary })}
                                    onCheckedChange={(checked) => {
                                      setProblem(null);
                                      update.mutate({ id: automation.id, isActive: checked }, { onError: fail });
                                    }}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    aria-label={fill(t.automations.edit, { summary })}
                                    onClick={(event) => {
                                      trigger.current = event.currentTarget;
                                      setEditing({ stage, automation });
                                    }}
                                  >
                                    <Pencil aria-hidden />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    iconOnly
                                    aria-label={fill(t.automations.remove, { summary })}
                                    onClick={(event) => {
                                      trigger.current = event.currentTarget;
                                      setRemoving({ automation, summary });
                                    }}
                                  >
                                    <Trash2 aria-hidden />
                                  </Button>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {editing ? (
        <AutomationDialog
          ws={ws}
          session={session.data}
          pipeline={pipeline}
          stage={editing.stage}
          automation={editing.automation}
          tags={tags.data ?? []}
          open
          onOpenChange={(next) => (next ? undefined : setEditing(null))}
          returnFocusTo={trigger}
        />
      ) : null}

      <Dialog
        title={t.automations.removeBody}
        closeLabel={t.common.close}
        open={removing !== null}
        onOpenChange={(next) => (next ? undefined : setRemoving(null))}
        returnFocusTo={trigger}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">{t.common.cancel}</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => removing && remove.mutate(removing.automation.id, { onSuccess: () => setRemoving(null), onError: fail })}
            >
              {t.automations.removeConfirm}
            </Button>
          </>
        }
      >
        <p className="text-sm font-medium text-fg">{removing?.summary}</p>
      </Dialog>
    </>
  );
}
