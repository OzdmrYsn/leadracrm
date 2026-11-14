"use client";

import { useId, useState, type ChangeEvent, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { fill, useI18n } from "@/i18n";
import { decodeCsv, parseCsv } from "@/lib/csv";
import { errorText } from "@/lib/errors";
import { keys, useFields, useImportLeads, useTags } from "@/lib/hooks";
import { LEAD_SLOTS, slotOf, type LeadSlot } from "@/lib/lead-columns";
import { fold } from "@/lib/text";
import type { CustomField, Session } from "@/lib/types";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 60;
const CHUNK = 200;
const UNASSIGNED = "none";
const NO_TAG = "none";

type Sheet = { name: string; headers: string[]; rows: string[][] };
type Step = "file" | "map" | "run" | "done";

/** Başlıklara göre ilk eşleme: bilinen adlar, sonra özel alan adları; tanınmayan sütun nota gider. Bir alana tek sütun. */
function guessTargets(headers: string[], fields: CustomField[]): string[] {
  const taken = new Set<string>();
  return headers.map((header) => {
    const slot = slotOf(header);
    const field = fields.find((item) => fold(item.name) === fold(header));
    const target = slot ?? (field ? `field:${field.id}` : null);
    if (!target || taken.has(target)) return "note";
    taken.add(target);
    return target;
  });
}

function ImportBody({ ws, session, onClose, onBusy }: { ws: string; session: Session; onClose: () => void; onBusy: (busy: boolean) => void }) {
  const { t } = useI18n();
  const id = useId();
  const client = useQueryClient();
  const fields = useFields(ws, "lead");
  const tags = useTags(ws);
  const send = useImportLeads(ws);

  const several = session.pipelines.length > 1;
  const stageOptions = session.pipelines.flatMap((pipeline) =>
    pipeline.stages
      .filter((stage) => stage.kind === "open" || (stage.kind === "incoming" && pipeline.incomingEnabled))
      .sort((a, b) => a.sort - b.sort)
      .map((stage) => ({ value: stage.id, label: several ? `${pipeline.name} › ${stage.name}` : stage.name, swatch: `--stage-${stage.color}`, kind: stage.kind, main: pipeline.isMain })),
  );
  const firstOpen = stageOptions.find((stage) => stage.main && stage.kind === "open") ?? stageOptions.find((stage) => stage.kind === "open");

  const [step, setStep] = useState<Step>("file");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [stageId, setStageId] = useState(firstOpen?.value ?? "");
  const [responsible, setResponsible] = useState(session.user.id);
  const [tagId, setTagId] = useState(NO_TAG);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, created: 0, skipped: 0 });
  const [failure, setFailure] = useState<string | null>(null);

  const targetLabel = (target: string) =>
    target.startsWith("field:")
      ? (fields.data?.find((field) => `field:${field.id}` === target)?.name ?? target)
      : (t.transfer.targets as Record<string, string>)[target];
  const targetOptions = [
    { value: "note", label: t.transfer.targets.note },
    { value: "skip", label: t.transfer.targets.skip },
    ...LEAD_SLOTS.map((slot: LeadSlot) => ({ value: slot, label: t.transfer.targets[slot] })),
    ...(fields.data ?? []).map((field) => ({ value: `field:${field.id}`, label: field.name })),
  ];

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setProblem(null);
    setSheet(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setProblem(t.transfer.tooBig);
    let table: string[][];
    try {
      table = parseCsv(decodeCsv(await file.arrayBuffer()));
    } catch {
      return setProblem(t.transfer.unreadable);
    }
    const [headers, ...rows] = table;
    if (!headers || rows.length === 0) return setProblem(headers ? t.transfer.noRows : t.transfer.unreadable);
    if (rows.length > MAX_ROWS) return setProblem(fill(t.transfer.tooManyRows, { count: rows.length.toLocaleString(session.workspace.locale) }));
    const width = Math.max(headers.length, ...rows.map((row) => row.length));
    if (width > MAX_COLUMNS) return setProblem(fill(t.transfer.tooManyColumns, { count: width }));
    // Başlığı olmayan sütunlar da eşlenebilsin diye numarayla adlandırılır.
    const named = Array.from({ length: width }, (_, index) => headers[index]?.trim() || fill(t.transfer.columnN, { n: index + 1 }));
    setSheet({ name: file.name, headers: named, rows });
    setTargets(guessTargets(named, fields.data ?? []));
  }

  function toRun() {
    const used = targets.filter((target) => target !== "skip" && target !== "note");
    const duplicate = used.find((target, index) => used.indexOf(target) !== index);
    if (duplicate) return setProblem(fill(t.transfer.duplicateTarget, { target: targetLabel(duplicate) }));
    if (targets.every((target) => target === "skip")) return setProblem(t.transfer.nothingMapped);
    if (!stageId) return;
    setProblem(null);
    void run();
  }

  async function run() {
    if (!sheet) return;
    setStep("run");
    onBusy(true);
    const columns = sheet.headers.map((header, index) => ({ header, target: targets[index] }));
    const total = { done: 0, created: 0, skipped: 0 };
    try {
      // Parça parça gönderilir: ilerleme görünür, tek bir istek dakikalarca sürmez. Bir parça reddedilirse orada durur.
      for (let start = 0; start < sheet.rows.length; start += CHUNK) {
        const rows = sheet.rows.slice(start, start + CHUNK).map((row) => columns.map((_, index) => (row[index] ?? "").slice(0, 5000)));
        const result = await send.mutateAsync({
          stageId,
          responsibleUserId: responsible === UNASSIGNED ? null : responsible,
          tagId: tagId === NO_TAG ? null : tagId,
          source: fill(t.transfer.source, { name: sheet.name }).slice(0, 200),
          columns,
          rows,
        });
        total.done += rows.length;
        total.created += result.created;
        total.skipped += result.skipped;
        setProgress({ ...total });
      }
    } catch (error) {
      setFailure(errorText(error, t));
    } finally {
      onBusy(false);
      setStep("done");
      void client.invalidateQueries({ queryKey: keys.all(ws) });
    }
  }

  if (!session.user.isAdmin) return <Notice tone="info">{t.transfer.adminOnly}</Notice>;

  if (step === "run" || step === "done") {
    const totalRows = sheet?.rows.length ?? 0;
    return (
      <div className="flex flex-col gap-4">
        {step === "run" ? (
          <>
            <p role="status" aria-live="polite" className="text-sm text-fg">
              {fill(t.transfer.progress, { done: progress.done, total: totalRows })}
            </p>
            <progress value={progress.done} max={totalRows} aria-label={t.transfer.running} className="h-2 w-full accent-(--color-accent)" />
          </>
        ) : failure ? (
          <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
            {fill(t.transfer.failed, { done: progress.done, reason: failure })}
          </Notice>
        ) : (
          <Notice tone="success" icon={<Check aria-hidden />}>
            {progress.skipped > 0 ? fill(t.transfer.doneSkipped, { count: progress.created, skipped: progress.skipped }) : fill(t.transfer.done, { count: progress.created })}
          </Notice>
        )}
        {step === "done" ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t.transfer.close}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (step === "map" && sheet) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{fill(t.transfer.summary, { name: sheet.name, rows: sheet.rows.length, columns: sheet.headers.length })}</p>
        {problem ? (
          <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
            {problem}
          </Notice>
        ) : null}
        <section aria-labelledby={`${id}-map`} className="flex flex-col gap-2">
          <h3 id={`${id}-map`} className="text-sm font-semibold text-fg">
            {t.transfer.mapTitle}
          </h3>
          <p className="text-xs text-muted">{t.transfer.mapBody}</p>
          <ul className="flex flex-col gap-3">
            {sheet.headers.map((header, index) => (
              <li key={index} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center sm:gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{header}</p>
                  <p className="truncate text-xs text-muted">{sheet.rows[0]?.[index] || t.common.none}</p>
                </div>
                <Select
                  aria-label={fill(t.transfer.targetOf, { column: header })}
                  value={targets[index]}
                  onValueChange={(next) => {
                    setProblem(null);
                    setTargets((current) => current.map((target, at) => (at === index ? next : target)));
                  }}
                  options={targetOptions}
                />
              </li>
            ))}
          </ul>
        </section>
        <Field id={`${id}-stage`} label={t.transfer.stage}>
          <Select id={`${id}-stage`} value={stageId} onValueChange={setStageId} options={stageOptions} />
        </Field>
        <Field id={`${id}-responsible`} label={t.transfer.responsible} hint={t.transfer.responsibleHint}>
          <Select
            id={`${id}-responsible`}
            value={responsible}
            onValueChange={setResponsible}
            options={[{ value: UNASSIGNED, label: t.common.unassigned }, ...session.users.map((user) => ({ value: user.id, label: user.name }))]}
            aria-describedby={`${id}-responsible-note`}
          />
        </Field>
        <Field id={`${id}-tag`} label={t.transfer.tag}>
          <Select
            id={`${id}-tag`}
            value={tagId}
            onValueChange={setTagId}
            options={[{ value: NO_TAG, label: t.transfer.noTag }, ...(tags.data ?? []).map((tag) => ({ value: tag.id, label: tag.name }))]}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setProblem(null);
              setSheet(null);
              setStep("file");
            }}
          >
            {t.transfer.back}
          </Button>
          <Button variant="primary" onClick={toRun} disabled={!stageId}>
            {fill(t.transfer.start, { count: sheet.rows.length })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field id={`${id}-file`} label={t.transfer.file} hint={t.transfer.fileHint} error={problem ?? undefined}>
        <input
          id={`${id}-file`}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(event) => void onFile(event)}
          aria-describedby={`${id}-file-note`}
          aria-invalid={problem ? true : undefined}
          className="block w-full rounded-md border border-border-input bg-bg text-sm text-fg file:mr-3 file:h-10 file:cursor-pointer file:border-0 file:bg-surface-strong file:px-3 file:text-sm file:font-medium file:text-fg"
        />
      </Field>
      {sheet ? <p className="text-sm text-fg">{fill(t.transfer.summary, { name: sheet.name, rows: sheet.rows.length, columns: sheet.headers.length })}</p> : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button variant="primary" disabled={!sheet || fields.isPending} onClick={() => setStep("map")}>
          {t.transfer.next}
        </Button>
      </div>
    </div>
  );
}

/** CSV'den lead içe aktarma: dosya seç, sütunları eşle, aktar. Pencere her açılışta baştan başlar. */
export function ImportDialog({
  ws,
  session,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={t.transfer.importTitle}
      description={t.transfer.importBody}
      closeLabel={t.common.close}
      open={open}
      // Aktarma sürerken pencere kapanmaz: yarıda kalan aktarmanın sonucu görülmeden kaybolmasın.
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      returnFocusTo={returnFocusTo}
    >
      <ImportBody ws={ws} session={session} onClose={() => onOpenChange(false)} onBusy={setBusy} />
    </Dialog>
  );
}
