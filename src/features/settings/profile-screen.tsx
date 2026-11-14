"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useGroups, useSession, useUpdateProfile } from "@/lib/hooks";
import type { Session } from "@/lib/types";
import { RightsSummary } from "./rights-editor";

function ProfileForm({ ws, session, groupName }: { ws: string; session: Session; groupName: string | null }) {
  const { t } = useI18n();
  const id = useId();
  const update = useUpdateProfile(ws);
  const { user } = session;
  const [name, setName] = useState(user.name);
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameError = submitted && name.trim() === "" ? t.profile.nameRequired : undefined;
  const dirty = name.trim() !== user.name;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setSaved(false);
    setProblem(null);
    if (name.trim() === "") return;
    update.mutate({ name }, { onSuccess: () => setSaved(true), onError: (error) => setProblem(errorText(error, t)) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {saved && !dirty ? (
        <Notice tone="success" icon={<Check aria-hidden />}>
          {t.profile.saved}
        </Notice>
      ) : null}
      <Field id={`${id}-name`} label={t.profile.name} error={nameError} required>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="name"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${id}-name-note` : undefined}
        />
      </Field>
      <dl className="flex flex-col gap-3 border-t pt-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-fg">{t.profile.email}</dt>
          <dd className="text-sm break-all text-fg">{user.email}</dd>
          <dd className="text-xs text-muted">{t.profile.emailHint}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-fg">{t.profile.role}</dt>
          <dd className="text-sm text-fg">{user.isAdmin ? t.team.roleAdmin : t.team.roleMember}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-fg">{t.profile.group}</dt>
          <dd className="text-sm text-fg">{groupName ?? t.team.noGroup}</dd>
        </div>
      </dl>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          {t.common.save}
        </Button>
      </div>
    </form>
  );
}

/** Ayarlar › Profil: kullanıcının kendi adı ve yetkilerinin özeti. */
export function ProfileScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const headingId = useId();
  const rightsId = useId();
  const session = useSession(ws);
  const groups = useGroups(ws);

  if (session.isPending || groups.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full max-w-xl" />
      </div>
    );
  }
  if (session.isError || groups.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<TriangleAlert />}
          title={t.common.loadFailed}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void session.refetch();
                void groups.refetch();
              }}
            >
              {t.common.retry}
            </Button>
          }
        />
      </div>
    );
  }

  const { user } = session.data;
  return (
    <div className="flex flex-col gap-8 p-4">
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {t.profile.title}
          </h2>
          <p className="text-sm text-muted">{t.profile.body}</p>
        </div>
        <ProfileForm ws={ws} session={session.data} groupName={groups.data.find((group) => group.id === user.groupId)?.name ?? null} />
      </section>
      <section aria-labelledby={rightsId} className="flex max-w-xl flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={rightsId} className="text-base font-semibold text-fg">
            {t.profile.rightsTitle}
          </h2>
          <p className="text-sm text-muted">{user.isAdmin ? t.team.adminRights : t.profile.rightsBody}</p>
        </div>
        {user.isAdmin ? null : <RightsSummary value={session.data.rights} />}
      </section>
    </div>
  );
}
