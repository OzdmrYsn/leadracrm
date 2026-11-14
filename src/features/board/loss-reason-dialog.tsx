"use client";

import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useSetLossReason } from "@/lib/hooks";
import type { Id, LossReason } from "@/lib/types";

function Body({ ws, leadId, reasons, onClose }: { ws: string; leadId: Id; reasons: LossReason[]; onClose: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const save = useSetLossReason(ws);
  const [reasonId, setReasonId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      <Field id={`${id}-reason`} label={t.lead.lossReason}>
        <Select id={`${id}-reason`} value={reasonId} onValueChange={setReasonId} placeholder={t.lead.noLossReason} options={reasons.map((reason) => ({ value: reason.id, label: reason.name }))} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t.board.lossSkip}
        </Button>
        <Button
          variant="primary"
          disabled={!reasonId}
          loading={save.isPending}
          onClick={() => save.mutate({ leadId, lossReasonId: reasonId }, { onSuccess: onClose, onError: (error) => setProblem(errorText(error, t)) })}
        >
          {t.common.save}
        </Button>
      </div>
    </div>
  );
}

/** Panoda bir lead kaybedildi olarak kapatılınca nedenini sorar. Atlanabilir; neden sonradan lead kartından da seçilir. */
export function LossReasonDialog({ ws, lead, reasons, onClose }: { ws: string; lead: { id: Id; name: string } | null; reasons: LossReason[]; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Dialog
      title={t.board.lossTitle}
      description={lead ? fill(t.board.lossBody, { name: lead.name }) : undefined}
      closeLabel={t.common.close}
      open={lead !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {lead ? <Body key={lead.id} ws={ws} leadId={lead.id} reasons={reasons} onClose={onClose} /> : null}
    </Dialog>
  );
}
