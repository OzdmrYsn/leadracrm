"use client";

import { useState, type FormEvent } from "react";
import { CircleCheck, FileSpreadsheet, FlaskConical, TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useCreateSheetLink, useDevGoogleFiles, useInspectSheet } from "@/lib/hooks";
import type { GoogleStatus, Id, Pipeline, SheetInspection, Tag } from "@/lib/types";

const NO_TAG = "none";

/* ---------- Google dosya seçicisi (yalnız gerçek kipte) ---------- */

type PickedDoc = { id: string; name: string };
type PickerBuilder = {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setCallback(callback: (data: { action: string; docs?: PickedDoc[] }) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};
type PickerWindow = Window & {
  gapi?: { load(name: string, callback: () => void): void };
  google?: { picker: { PickerBuilder: new () => PickerBuilder; ViewId: { SPREADSHEETS: string }; Action: { PICKED: string; CANCEL: string } } };
};

function loadPickerScript(): Promise<void> {
  const win = window as PickerWindow;
  if (win.google?.picker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ready = () => (win.gapi ? win.gapi.load("picker", resolve) : reject(new Error("gapi missing")));
    if (win.gapi) return ready();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("picker script failed"));
    document.head.appendChild(script);
  });
}

/**
 * Google'ın kendi dosya seçicisini açar; kullanıcı bir tablo seçince o dosyaya erişim izni vermiş olur.
 * Seçici sayfanın üstünde ayrı bir katmanda açılır; bu yüzden bizim penceremiz o sırada kapalı olmalıdır.
 */
export async function pickSpreadsheet(ws: string, accountId: Id, google: GoogleStatus): Promise<PickedDoc | null> {
  if (!google.pickerKey || !google.appId) throw new Error("picker not configured");
  const { accessToken } = await api.post<{ accessToken: string }>(`/api/w/${ws}/google/accounts/${accountId}/token`);
  await loadPickerScript();
  const picker = (window as PickerWindow).google!.picker;
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(picker.ViewId.SPREADSHEETS)
      .setOAuthToken(accessToken)
      .setDeveloperKey(google.pickerKey!)
      .setAppId(google.appId!)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0] ? { id: data.docs[0].id, name: data.docs[0].name } : null);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

/* ---------- bağlama adımları ---------- */

/** Pencere seçici açılırken kapanıp yeniden açıldığı için durum üst bileşende tutulur. */
export type SheetDraft = { accountId: Id | null; inspection: SheetInspection | null };

export function SheetConnect({
  ws,
  google,
  draft,
  onDraft,
  onPickWithGoogle,
  pipelines,
  defaultPipelineId,
  tags,
  defaultName,
  onDone,
  onCancel,
}: {
  ws: string;
  google: GoogleStatus;
  draft: SheetDraft;
  onDraft: (next: SheetDraft) => void;
  /** Gerçek kipte Google'ın dosya seçicisini açar (üst bileşen pencereyi geçici olarak kapatır). */
  onPickWithGoogle: (accountId: Id) => void;
  pipelines: Pipeline[];
  defaultPipelineId: string;
  tags: Tag[];
  defaultName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const s = t.sheets;
  const startUrl = `/api/w/${ws}/google/start`;
  const account = google.accounts.find((item) => item.id === draft.accountId) ?? google.accounts[0] ?? null;
  const devFiles = useDevGoogleFiles(ws, account?.id ?? null, google.mode === "dev" && account?.status === "active" && draft.inspection === null);
  const inspect = useInspectSheet(ws);
  const create = useCreateSheetLink(ws);

  const targetsOf = (pipelineId: string) =>
    (pipelines.find((item) => item.id === pipelineId)?.stages ?? []).filter((stage) => stage.kind === "incoming" || stage.kind === "open").sort((a, b) => a.sort - b.sort);
  const firstOpen = (pipelineId: string) => {
    const targets = targetsOf(pipelineId);
    return targets.find((stage) => stage.kind === "open")?.id ?? targets[0]?.id ?? "";
  };
  const [name, setName] = useState(defaultName);
  const [tabId, setTabId] = useState<number | null>(null);
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);
  const [stageId, setStageId] = useState(() => firstOpen(defaultPipelineId));
  const [tagId, setTagId] = useState(NO_TAG);
  const [importExisting, setImportExisting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; imported: number } | null>(null);

  const inspection = draft.inspection;
  const tab = inspection?.tabs.find((item) => item.sheetId === tabId) ?? inspection?.tabs[0] ?? null;

  function choose(spreadsheetId: string) {
    if (!account) return;
    setProblem(null);
    inspect.mutate({ accountId: account.id, spreadsheetId }, { onSuccess: (found) => onDraft({ accountId: account.id, inspection: found }), onError: (error) => setProblem(errorText(error, t)) });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!account || !inspection || !tab || name.trim() === "") return;
    setProblem(null);
    create.mutate(
      { accountId: account.id, spreadsheetId: inspection.spreadsheetId, sheetId: tab.sheetId, name, stageId, tagId: tagId === NO_TAG ? null : tagId, importExisting },
      { onSuccess: (created) => setResult({ name: created.intake.name, imported: created.imported }), onError: (error) => setProblem(errorText(error, t)) },
    );
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success" icon={<CircleCheck aria-hidden />}>
          {result.imported > 0 ? fill(s.doneImported, { name: result.name, count: result.imported }) : fill(s.done, { name: result.name })} {s.doneBody}
        </Notice>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onDone}>
            {t.intakes.done}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {google.mode === "dev" ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">
          <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {s.devAccount}
        </p>
      ) : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}

      {!account ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-fg">{s.signInBody}</p>
          <a href={startUrl} className={buttonClass({ variant: "primary" })}>
            {s.signIn}
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-56">
              <Field id="sheet-account" label={s.account}>
                <Select
                  id="sheet-account"
                  value={account.id}
                  onValueChange={(next) => onDraft({ accountId: next, inspection: null })}
                  options={google.accounts.map((item) => ({ value: item.id, label: item.email }))}
                />
              </Field>
            </div>
            <a href={startUrl} className={buttonClass({ variant: account.status === "reconnect" ? "primary" : "secondary" })}>
              {account.status === "reconnect" ? s.signIn : s.addAccount}
            </a>
          </div>
          {account.status === "reconnect" ? (
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
              {s.reconnect}
            </Notice>
          ) : !inspection ? (
            google.mode === "dev" ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-fg">{s.pickFrom}</h3>
                {devFiles.isPending || inspect.isPending ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <ul className="flex flex-col divide-y rounded-md border">
                    {(devFiles.data ?? []).map((file) => (
                      <li key={file.id}>
                        <button type="button" onClick={() => choose(file.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-medium text-fg transition-colors hover:bg-surface">
                          <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-success" />
                          {file.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <Button variant="primary" className="self-start" loading={inspect.isPending} icon={<FileSpreadsheet aria-hidden />} onClick={() => onPickWithGoogle(account.id)}>
                {s.pick}
              </Button>
            )
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                  <FileSpreadsheet aria-hidden className="size-4 shrink-0 text-success" />
                  <span className="truncate">{inspection.name}</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => onDraft({ accountId: account.id, inspection: null })}>
                  {s.pickAgain}
                </Button>
              </div>
              {inspection.tabs.length > 1 ? (
                <Field id="sheet-tab" label={s.tab}>
                  <Select id="sheet-tab" value={String(tab?.sheetId ?? "")} onValueChange={(next) => setTabId(Number(next))} options={inspection.tabs.map((item) => ({ value: String(item.sheetId), label: item.title }))} />
                </Field>
              ) : null}
              {tab && tab.header.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-medium text-fg">{s.columns}</h3>
                  <ul className="flex flex-wrap gap-1">
                    {tab.header.map((column, index) => (
                      <li key={`${column}-${index}`} className="rounded-sm bg-surface-strong px-2 py-0.5 text-xs text-fg">
                        {column}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
                  {s.noHeader}
                </Notice>
              )}
              <Field id="sheet-name" label={t.intakes.name} required>
                <Input id="sheet-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="off" required />
              </Field>
              {pipelines.length > 1 ? (
                <Field id="sheet-pipeline" label={t.sources.pipeline}>
                  <Select
                    id="sheet-pipeline"
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
                <Field id="sheet-stage" label={t.intakes.stage}>
                  <Select id="sheet-stage" value={stageId} onValueChange={setStageId} options={targetsOf(pipelineId).map((stage) => ({ value: stage.id, label: stage.name, swatch: `--stage-${stage.color}` }))} />
                </Field>
                <Field id="sheet-tag" label={t.intakes.tag}>
                  <Select id="sheet-tag" value={tagId} onValueChange={setTagId} options={[{ value: NO_TAG, label: t.intakes.noTag }, ...tags.map((tag) => ({ value: tag.id, label: tag.name }))]} />
                </Field>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox id="sheet-existing" large checked={importExisting} onCheckedChange={(checked) => setImportExisting(checked === true)} aria-describedby="sheet-existing-note" />
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="sheet-existing" className="text-sm font-medium text-fg">
                    {s.importExisting}
                  </label>
                  <p id="sheet-existing-note" className="text-xs text-muted">
                    {s.importExistingHint}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={onCancel}>
                  {t.common.cancel}
                </Button>
                <Button type="submit" variant="primary" loading={create.isPending} disabled={!tab || tab.header.length === 0 || name.trim() === ""}>
                  {s.submit}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
