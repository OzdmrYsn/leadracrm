"use client";

import { useState } from "react";
import { Info, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Dialog, DialogClose } from "@/components/ui/overlay";
import { LeadPicker } from "@/features/leads/lead-picker";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useAcceptLead, useDeclineLead, useLinkLead, useSession } from "@/lib/hooks";
import type { ChannelKind, Id, LeadSummary } from "@/lib/types";

/** Gelen talep paneli: kabul et, mevcut bir lead'e bağla ya da reddet. Başka biri önce davranırsa bunu söyler. */
export function IncomingPanel({
  ws,
  leadId,
  contactName,
  channel,
  onDeclined,
  onLinked,
}: {
  ws: string;
  leadId: Id;
  contactName: string;
  channel: ChannelKind;
  onDeclined?: () => void;
  /** Talep başka bir lead'e bağlandı; bu lead artık yok. */
  onLinked?: (targetLeadId: Id) => void;
}) {
  const { t } = useI18n();
  const session = useSession(ws);
  const accept = useAcceptLead(ws);
  const decline = useDeclineLead(ws);
  const link = useLinkLead(ws);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<LeadSummary | null>(null);
  const busy = accept.isPending || decline.isPending || link.isPending;
  // Başka bir gelen talebe bağlanamaz; seçici yalnız açık aşamalardaki lead'leri gösterir.
  const incomingStages = new Set((session.data?.pipelines ?? []).flatMap((pipeline) => pipeline.stages.filter((stage) => stage.kind === "incoming").map((stage) => stage.id)));

  function onError(error: unknown) {
    setMessage(errorText(error, t));
  }

  return (
    <section aria-label={t.incoming.title} className="flex flex-col gap-3 border-t bg-info-soft p-3">
      <div className="flex items-start gap-2 text-sm text-info">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{t.incoming.title}</p>
          <p className="text-fg">{fill(t.incoming.body, { name: contactName, channel: t.chat.channel[channel] })}</p>
        </div>
      </div>
      {message ? <Notice tone="warning">{message}</Notice> : null}
      {target ? (
        <div role="group" aria-label={t.incoming.link} className="flex flex-col gap-2 rounded-md bg-bg p-3">
          <p className="text-sm break-words text-fg">{fill(t.incoming.linkConfirm, { lead: target.name })}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={link.isPending} onClick={() => setTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={link.isPending}
              onClick={() => {
                setMessage(null);
                // mutateAsync: bağlanınca bu panel ekrandan çıkabilir; sonuç yine de üst bileşene ulaşmalı.
                link.mutateAsync({ leadId, targetLeadId: target.id }).then(
                  () => onLinked?.(target.id),
                  (error: unknown) => {
                    setTarget(null);
                    onError(error);
                  },
                );
              }}
            >
              {t.incoming.linkSubmit}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={accept.isPending} disabled={busy} onClick={() => accept.mutate(leadId, { onError })}>
            {t.incoming.accept}
          </Button>
          <LeadPicker
            ws={ws}
            locale={session.data?.workspace.locale ?? "tr-TR"}
            accepts={(lead) => lead.id !== leadId && !incomingStages.has(lead.stageId)}
            onPick={(lead) => {
              setMessage(null);
              setTarget(lead);
            }}
            trigger={
              <Button icon={<Link2 aria-hidden />} disabled={busy}>
                {t.incoming.link}
              </Button>
            }
          />
          <Dialog
            title={t.incoming.declineTitle}
            description={t.incoming.declineBody}
            closeLabel={t.common.close}
            trigger={
              <Button variant="ghost" disabled={busy} className="text-danger">
                {t.incoming.decline}
              </Button>
            }
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost">{t.common.cancel}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="danger" onClick={() => decline.mutate(leadId, { onError, onSuccess: onDeclined })}>
                    {t.incoming.declineConfirm}
                  </Button>
                </DialogClose>
              </>
            }
          >
            <p className="text-sm text-fg">{contactName}</p>
          </Dialog>
        </div>
      )}
    </section>
  );
}
