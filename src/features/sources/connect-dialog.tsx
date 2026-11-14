"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateIntake } from "@/lib/hooks";
import type { Intake, Pipeline, Tag } from "@/lib/types";
import { exampleBody, flatExampleBody, sheetsScript } from "@/features/automations/sheets-script";
import type { SourceAction } from "./catalog";

const NO_TAG = "none";

export type Secret = { intake: Intake; token: string };

/** Kopyalanabilir, salt okunur metin. Pano erişimi yoksa metin seçilir; kullanıcı elle kopyalar. */
function CopyBox({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const element = document.getElementById(id);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.select();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <Button size="sm" icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />} onClick={() => void copy()}>
          <span aria-live="polite">{copied ? t.intakes.copied : t.intakes.copy}</span>
        </Button>
      </div>
      {multiline ? (
        <Textarea id={id} readOnly value={value} rows={8} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
      ) : (
        <Input id={id} readOnly value={value} className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
      )}
    </div>
  );
}

function Steps({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </>
  );
}

/** Gizli adres yalnız oluşturulurken ve yenilenirken gösterilir; altında o kaynağa özgü kurulum adımları durur. */
export function SecretPanel({ secret, onDone }: { secret: Secret; onDone: () => void }) {
  const { t } = useI18n();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/api/intake/${secret.token}`;
  const local = /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(origin);
  const provider = secret.intake.provider;
  const name = t.sources.items[provider].name;
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
        {t.intakes.secretBody}
      </Notice>
      {local ? <Notice tone="info">{t.intakes.localWarning}</Notice> : null}
      <CopyBox label={t.intakes.url} value={url} />
      <div className="flex flex-col gap-2">
        {provider === "google_sheets" || provider === "google_forms" ? (
          <>
            <Steps title={provider === "google_forms" ? fill(t.sources.guideTitle, { name }) : t.intakes.sheetsTitle} steps={provider === "google_forms" ? t.sources.guides.google_forms : t.intakes.sheetsSteps} />
            <CopyBox label={t.intakes.script} value={sheetsScript(url)} multiline />
          </>
        ) : provider === "generic" ? (
          <>
            <h3 className="text-sm font-semibold text-fg">{t.intakes.genericTitle}</h3>
            <p className="text-sm text-fg">{t.intakes.genericBody}</p>
            <CopyBox label={t.intakes.example} value={exampleBody} multiline />
          </>
        ) : (
          <>
            <Steps title={fill(t.sources.guideTitle, { name })} steps={t.sources.guides[provider]} />
            <CopyBox label={t.sources.flatExample} value={flatExampleBody} multiline />
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onDone}>
          {t.intakes.done}
        </Button>
      </div>
    </div>
  );
}

/** Katalogdan seçilen kaynak için lead alma kapısı açar: ad, lead'in düşeceği aşama ve isteğe bağlı etiket. */
export function ConnectForm({
  ws,
  action,
  sourceName,
  pipelines,
  defaultPipelineId,
  tags,
  onCreated,
  onCancel,
}: {
  ws: string;
  action: Extract<SourceAction, { type: "intake" }>;
  sourceName: string;
  pipelines: Pipeline[];
  defaultPipelineId: string;
  tags: Tag[];
  onCreated: (secret: Secret) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const create = useCreateIntake(ws);
  // Kapanmış aşamaya lead düşmez.
  const targetsOf = (pipelineId: string) =>
    (pipelines.find((item) => item.id === pipelineId)?.stages ?? []).filter((stage) => stage.kind === "incoming" || stage.kind === "open").sort((a, b) => a.sort - b.sort);
  const firstOpen = (pipelineId: string) => {
    const targets = targetsOf(pipelineId);
    return targets.find((stage) => stage.kind === "open")?.id ?? targets[0]?.id ?? "";
  };
  const [name, setName] = useState(fill(t.sources.defaultName, { name: sourceName }));
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);
  const [stageId, setStageId] = useState(() => firstOpen(defaultPipelineId));
  const [tagId, setTagId] = useState(NO_TAG);
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({});
  const stages = targetsOf(pipelineId);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setErrors({ name: t.intakes.nameRequired });
      return;
    }
    setErrors({});
    create.mutate(
      { name, kind: action.kind, provider: action.provider, stageId, tagId: tagId === NO_TAG ? null : tagId },
      { onSuccess: onCreated, onError: (problem) => setErrors({ form: errorText(problem, t) }) },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.form ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {errors.form}
        </Notice>
      ) : null}
      <Field id="intake-name" label={t.intakes.name} hint={t.intakes.nameHint} error={errors.name} required>
        <Input
          id="intake-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setErrors({});
          }}
          onFocus={(event) => event.currentTarget.select()}
          maxLength={120}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby="intake-name-note"
          required
          autoFocus
        />
      </Field>
      {pipelines.length > 1 ? (
        <Field id="intake-pipeline" label={t.sources.pipeline}>
          <Select
            id="intake-pipeline"
            value={pipelineId}
            onValueChange={(next) => {
              setPipelineId(next);
              setStageId(firstOpen(next));
            }}
            options={pipelines.map((item) => ({ value: item.id, label: item.name }))}
          />
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="intake-stage" label={t.intakes.stage}>
          <Select id="intake-stage" value={stageId} onValueChange={setStageId} options={stages.map((stage) => ({ value: stage.id, label: stage.name, swatch: `--stage-${stage.color}` }))} />
        </Field>
        <Field id="intake-tag" label={t.intakes.tag}>
          <Select id="intake-tag" value={tagId} onValueChange={setTagId} options={[{ value: NO_TAG, label: t.intakes.noTag }, ...tags.map((tag) => ({ value: tag.id, label: tag.name }))]} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t.intakes.submit}
        </Button>
      </div>
    </form>
  );
}
