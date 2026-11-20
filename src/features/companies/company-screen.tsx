"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { InlineField } from "@/components/app/inline-field";
import { BackLink, RecordPending, RecordProblem, RecordSection, ResponsibleSelect } from "@/components/app/record";
import { ScreenHeader } from "@/components/app/shell";
import { Notice } from "@/components/ui/feedback";
import { CustomFields } from "@/features/fields/custom-fields";
import { LeadLinks } from "@/features/leads/lead-links";
import { TasksSection } from "@/features/tasks/tasks-section";
import { useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { useCompany, useNow, useSession, useUpdateCompany } from "@/lib/hooks";
import type { Id } from "@/lib/types";

export function CompanyScreen({ ws, companyId }: { ws: string; companyId: Id }) {
  const { t } = useI18n();
  const session = useSession(ws);
  const detail = useCompany(ws, companyId);
  const update = useUpdateCompany(ws, companyId);
  const now = useNow();
  const [problem, setProblem] = useState<string | null>(null);

  const listHref = `/w/${ws}/companies`;
  const back = <BackLink href={listHref} label={t.companies.back} />;

  if (detail.isPending || session.isPending) return <RecordPending back={back} />;
  if (detail.isError || session.isError || !detail.data || !session.data) {
    return (
      <RecordProblem
        title={t.companies.title}
        back={back}
        missing={detail.error instanceof ApiError && detail.error.status === 404}
        listHref={listHref}
        listLabel={t.companies.back}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const { company, contacts, leads } = detail.data;
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
      <ScreenHeader title={company.name} before={back} />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[var(--layout-record-panel)_minmax(0,1fr)] lg:overflow-hidden">
        <section aria-label={t.companies.details} className="flex flex-col gap-2 border-b bg-bg p-3 lg:overflow-y-auto lg:border-r lg:border-b-0">
          {problem ? (
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
              {problem}
            </Notice>
          ) : null}

          <InlineField
            label={t.companies.name}
            value={company.name}
            display={company.name}
            validate={(next) => (next.trim() === "" ? t.companies.nameRequired : null)}
            onSave={(next) => save({ name: next })}
          />
          <ResponsibleSelect
            id="company-responsible"
            value={company.responsibleUserId}
            users={users}
            disabled={update.isPending}
            onChange={(next) => void save({ responsibleUserId: next }).catch(() => undefined)}
          />
          <CustomFields
            ws={ws}
            entityType="company"
            values={company.custom}
            locale={workspace.locale}
            canManage={user.isAdmin}
            onSave={(patch) => save({ custom: patch })}
          />
          <div className="px-2 py-1">
            <h2 className="text-xs text-muted">{t.common.created}</h2>
            <p className="text-sm text-fg">
              <time dateTime={company.createdAt}>{formatDateTime(company.createdAt, workspace.locale, workspace.timezone, workspace.dateFormat)}</time>
            </p>
          </div>
        </section>

        <section aria-label={t.companies.related} className="flex min-w-0 flex-col gap-6 p-4 lg:overflow-y-auto">
          <TasksSection ws={ws} session={session.data} target={{ kind: "company", id: company.id, name: company.name }} now={now} />
          <RecordSection title={t.companies.contacts}>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">{t.companies.noContacts}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <Link
                      href={`/w/${ws}/contacts/${contact.id}`}
                      className="min-w-0 flex-1 truncate rounded-sm text-sm font-semibold text-accent underline-offset-2 hover:underline"
                    >
                      {contact.name}
                    </Link>
                    <span className="min-w-0 truncate text-sm text-muted">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>
          <RecordSection title={t.companies.leads}>
            <LeadLinks ws={ws} leads={leads} session={session.data} emptyText={t.companies.noLeads} />
          </RecordSection>
        </section>
      </div>
    </>
  );
}
