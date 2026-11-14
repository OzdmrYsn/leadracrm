"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateLossReason, useDeleteLossReason, useSession, useUpdateLossReason, useUpdateWorkspace } from "@/lib/hooks";
import type { Workspace } from "@/lib/types";
import { NameList } from "./name-list";

const CURRENCIES = [
  "TRY", "USD", "EUR", "GBP", "AZN", "CHF", "RUB", "UAH", "KZT", "GEL", "AED", "SAR", "QAR", "EGP", "ILS", "INR",
  "CNY", "JPY", "KRW", "CAD", "AUD", "BRL", "MXN", "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "RON", "BGN", "ZAR",
]; // prettier-ignore

// Batıdan doğuya, her saat farkından en az bir şehir. Tam liste yerine kısa liste: seçmesi kolay olsun.
const TIME_ZONES = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Halifax", "America/Sao_Paulo", "Atlantic/Azores", "UTC", "Europe/London", "Europe/Lisbon", "Europe/Berlin",
  "Europe/Paris", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Athens", "Europe/Kyiv",
  "Europe/Bucharest", "Europe/Helsinki", "Africa/Cairo", "Africa/Johannesburg", "Europe/Istanbul", "Europe/Moscow",
  "Asia/Riyadh", "Asia/Dubai", "Asia/Baku", "Asia/Tbilisi", "Asia/Tehran", "Asia/Karachi", "Asia/Tashkent", "Asia/Kolkata",
  "Asia/Almaty", "Asia/Dhaka", "Asia/Bangkok", "Asia/Jakarta", "Asia/Shanghai", "Asia/Singapore", "Asia/Hong_Kong",
  "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
]; // prettier-ignore

/** "UTC+03:00 Europe/Istanbul". Tarayıcının tanımadığı saat dilimi null döner. */
function zoneLabel(zone: string, at: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at);
    const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    return `${offset === "GMT" ? "UTC+00:00" : offset.replace("GMT", "UTC")} ${zone.replace(/_/g, " ")}`;
  } catch {
    return null;
  }
}

function WorkspaceForm({ ws, workspace, canEdit }: { ws: string; workspace: Workspace; canEdit: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const update = useUpdateWorkspace(ws);
  const [name, setName] = useState(workspace.name);
  const [currency, setCurrency] = useState(workspace.currency);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const currencies = useMemo(() => {
    const names = new Intl.DisplayNames([workspace.locale], { type: "currency" });
    // Listede olmayan bir para birimi kayıtlıysa o da seçilebilir kalır.
    return [...new Set([workspace.currency, ...CURRENCIES])]
      .map((code) => ({ value: code, label: `${code} · ${names.of(code) ?? code}` }))
      .sort((a, b) => a.label.localeCompare(b.label, workspace.locale));
  }, [workspace.currency, workspace.locale]);

  const zones = useMemo(() => {
    const now = new Date();
    const list = TIME_ZONES.includes(workspace.timezone) ? TIME_ZONES : [workspace.timezone, ...TIME_ZONES];
    return list.flatMap((zone) => {
      const label = zoneLabel(zone, now);
      return label ? [{ value: zone, label }] : [];
    });
  }, [workspace.timezone]);

  const nameError = submitted && name.trim() === "" ? t.workspaceSettings.nameRequired : undefined;
  const dirty = name.trim() !== workspace.name || currency !== workspace.currency || timezone !== workspace.timezone;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setSaved(false);
    setProblem(null);
    if (name.trim() === "") return;
    update.mutate(
      { name, currency, timezone },
      { onSuccess: () => setSaved(true), onError: (error) => setProblem(errorText(error, t)) },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {!canEdit ? <Notice tone="info">{t.workspaceSettings.adminOnly}</Notice> : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {saved && !dirty ? (
        <Notice tone="success" icon={<Check aria-hidden />}>
          {t.workspaceSettings.saved}
        </Notice>
      ) : null}

      <Field id={`${id}-name`} label={t.workspaceSettings.name} error={nameError} required>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          disabled={!canEdit}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${id}-name-note` : undefined}
          autoComplete="organization"
        />
      </Field>
      <Field id={`${id}-currency`} label={t.workspaceSettings.currency} hint={t.workspaceSettings.currencyHint}>
        <Select id={`${id}-currency`} value={currency} onValueChange={setCurrency} options={currencies} disabled={!canEdit} aria-describedby={`${id}-currency-note`} />
      </Field>
      <Field id={`${id}-timezone`} label={t.workspaceSettings.timezone} hint={t.workspaceSettings.timezoneHint}>
        <Select id={`${id}-timezone`} value={timezone} onValueChange={setTimezone} options={zones} disabled={!canEdit} aria-describedby={`${id}-timezone-note`} />
      </Field>

      <dl className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-fg">{t.workspaceSettings.language}</dt>
          <dd className="text-sm text-fg">{t.workspaceSettings.languageValue}</dd>
          <dd className="text-xs text-muted">{t.workspaceSettings.languageHint}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-fg">{t.workspaceSettings.address}</dt>
          <dd className="font-mono text-sm break-all text-fg">/w/{workspace.slug}</dd>
          <dd className="text-xs text-muted">{t.workspaceSettings.addressHint}</dd>
        </div>
      </dl>

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
            {t.common.save}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

/** Ayarlar › Çalışma alanı: ad, para birimi, saat dilimi. */
export function WorkspaceScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const headingId = useId();
  const session = useSession(ws);
  const createReason = useCreateLossReason(ws);
  const updateReason = useUpdateLossReason(ws);
  const deleteReason = useDeleteLossReason(ws);

  if (session.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full max-w-xl" />
      </div>
    );
  }
  if (session.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<TriangleAlert />}
          title={t.common.loadFailed}
          action={
            <Button variant="secondary" onClick={() => void session.refetch()}>
              {t.common.retry}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-4">
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {t.workspaceSettings.title}
          </h2>
          <p className="text-sm text-muted">{t.workspaceSettings.body}</p>
        </div>
        <WorkspaceForm ws={ws} workspace={session.data.workspace} canEdit={session.data.user.isAdmin} />
      </section>
      <NameList
        labels={t.lossReasons}
        items={session.data.lossReasons}
        canEdit={session.data.user.isAdmin}
        maxLength={120}
        onCreate={(name) => createReason.mutateAsync(name)}
        onRename={(id, name) => updateReason.mutateAsync({ id, name })}
        onDelete={(id) => deleteReason.mutateAsync(id)}
      />
    </div>
  );
}
