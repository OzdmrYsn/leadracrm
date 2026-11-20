"use client";

import { useId, useState, type FormEvent } from "react";
import { Mail, MessageSquare, Phone, TriangleAlert, X } from "lucide-react";
import { InlineField } from "@/components/app/inline-field";
import { BackLink, RecordPending, RecordProblem, RecordSection, ResponsibleSelect } from "@/components/app/record";
import { ScreenHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { CompanyBlock } from "@/features/companies/company-block";
import { CustomFields } from "@/features/fields/custom-fields";
import { LeadLinks } from "@/features/leads/lead-links";
import { TasksSection } from "@/features/tasks/tasks-section";
import { fill, useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useContact, useNow, useSession, useUpdateContact } from "@/lib/hooks";
import type { ContactHandle, Id } from "@/lib/types";

type Addable = "phone" | "email";

/**
 * Telefon ve e-posta eklenir, kaldırılır. Kanal kimlikleri (Telegram, WhatsApp) yazışmayı kişiye bağlar;
 * bu yüzden yalnız gösterilir, buradan kaldırılamaz.
 */
function Handles({ handles, onSave }: { handles: ContactHandle[]; onSave: (next: ContactHandle[]) => Promise<unknown> }) {
  const { t } = useI18n();
  const inputId = useId();
  const [adding, setAdding] = useState<Addable | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(next: ContactHandle[], done?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      done?.();
    } catch (problem) {
      setError(errorText(problem, t));
    } finally {
      setBusy(false);
    }
  }

  function start(kind: Addable) {
    setAdding(kind);
    setDraft("");
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!adding || draft.trim() === "") return;
    void run([...handles, { kind: adding, value: draft }], () => setAdding(null));
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-1">
      <h2 className="text-xs text-muted">{t.contacts.handles}</h2>
      {handles.length === 0 ? (
        <p className="text-sm text-muted">{t.contacts.noHandles}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {handles.map((handle) => {
            const editable = handle.kind === "phone" || handle.kind === "email";
            return (
              <li key={`${handle.kind}-${handle.value}`} className="flex min-h-6 items-center gap-2 text-sm text-fg">
                <span aria-hidden className="shrink-0 text-muted [&_svg]:size-4">
                  {handle.kind === "phone" ? <Phone /> : handle.kind === "email" ? <Mail /> : <MessageSquare />}
                </span>
                {handle.kind === "phone" ? (
                  <a href={`tel:${handle.value.replace(/[^\d+]/g, "")}`} className="min-w-0 flex-1 rounded-sm break-words underline-offset-4 hover:underline">
                    {handle.value}
                  </a>
                ) : handle.kind === "email" ? (
                  <a href={`mailto:${handle.value}`} className="min-w-0 flex-1 rounded-sm break-all underline-offset-4 hover:underline">
                    {handle.value}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 break-words">
                    {t.chat.channel[handle.kind]}: {handle.value}
                  </span>
                )}
                {editable ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={fill(t.contacts.removeHandle, { value: handle.value })}
                    title={fill(t.contacts.removeHandle, { value: handle.value })}
                    onClick={() => void run(handles.filter((item) => item !== handle))}
                    className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-strong hover:text-fg disabled:opacity-50"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-xs text-muted">
            {adding === "phone" ? t.contacts.newPhone : t.contacts.newEmail}
          </label>
          <Input
            id={inputId}
            type={adding === "phone" ? "tel" : "email"}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(null);
            }}
            maxLength={255}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            autoFocus
          />
          {error ? (
            <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={busy} disabled={draft.trim() === ""}>
              {t.contacts.addHandle}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Phone aria-hidden />} onClick={() => start("phone")}>
            {t.contacts.addPhone}
          </Button>
          <Button size="sm" icon={<Mail aria-hidden />} onClick={() => start("email")}>
            {t.contacts.addEmail}
          </Button>
        </div>
      )}
      {error && !adding ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactScreen({ ws, contactId }: { ws: string; contactId: Id }) {
  const { t } = useI18n();
  const session = useSession(ws);
  const detail = useContact(ws, contactId);
  const update = useUpdateContact(ws, contactId);
  const now = useNow();
  const [problem, setProblem] = useState<string | null>(null);

  const listHref = `/w/${ws}/contacts`;
  const back = <BackLink href={listHref} label={t.contacts.back} />;

  if (detail.isPending || session.isPending) return <RecordPending back={back} />;
  if (detail.isError || session.isError || !detail.data || !session.data) {
    return (
      <RecordProblem
        title={t.contacts.title}
        back={back}
        missing={detail.error instanceof ApiError && detail.error.status === 404}
        listHref={listHref}
        listLabel={t.contacts.back}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const { contact, company, leads } = detail.data;
  const { workspace, users, user } = session.data;

  function save(input: Parameters<typeof update.mutateAsync>[0]) {
    setProblem(null);
    return update.mutateAsync(input).catch((error: unknown) => {
      setProblem(errorText(error, t));
      throw error;
    });
  }

  return (
    <>
      <ScreenHeader title={contact.name} before={back} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[var(--layout-record-panel)_minmax(0,1fr)] lg:overflow-hidden">
        <section aria-label={t.contacts.details} className="flex flex-col gap-2 border-b bg-bg p-3 lg:overflow-y-auto lg:border-r lg:border-b-0">
          {problem ? (
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
              {problem}
            </Notice>
          ) : null}

          <InlineField
            label={t.contacts.name}
            value={contact.name}
            display={contact.name}
            validate={(next) => (next.trim() === "" ? t.contacts.nameRequired : null)}
            onSave={(next) => save({ name: next })}
          />
          <ResponsibleSelect
            id="contact-responsible"
            value={contact.responsibleUserId}
            users={users}
            disabled={update.isPending}
            onChange={(next) => void save({ responsibleUserId: next }).catch(() => undefined)}
          />
          <div className="px-2 py-1">
            <CompanyBlock
              ws={ws}
              locale={workspace.locale}
              company={company}
              disabled={update.isPending}
              onChange={(companyId) => save({ companyId })}
            />
          </div>
          <Handles handles={contact.handles} onSave={(next) => update.mutateAsync({ handles: next })} />
          <CustomFields
            ws={ws}
            entityType="contact"
            values={contact.custom}
            locale={workspace.locale}
            canManage={user.isAdmin}
            onSave={(patch) => save({ custom: patch })}
          />
          <div className="px-2 py-1">
            <h2 className="text-xs text-muted">{t.common.created}</h2>
            <p className="text-sm text-fg">
              <time dateTime={contact.createdAt}>{formatDateTime(contact.createdAt, workspace.locale, workspace.timezone, workspace.dateFormat)}</time>
            </p>
          </div>
        </section>

        <section aria-label={t.contacts.related} className="flex min-w-0 flex-col gap-6 p-4 lg:overflow-y-auto">
          <TasksSection ws={ws} session={session.data} target={{ kind: "contact", id: contact.id, name: contact.name }} now={now} />
          <RecordSection title={t.contacts.leads}>
            <LeadLinks ws={ws} leads={leads} session={session.data} emptyText={t.contacts.noLeads} />
          </RecordSection>
        </section>
      </div>
    </>
  );
}
