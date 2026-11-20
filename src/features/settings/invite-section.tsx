"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, FlaskConical, MailPlus, RotateCw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { formatAgo } from "@/lib/format";
import { useCreateInvitation, useInvitations, useNow, useResendInvitation, useRevokeInvitation } from "@/lib/hooks";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kullanıcı daveti: e-posta, ad ve rol; altında bekleyen davetler (yeniden gönder, geri al). Yalnız yönetici görür. */
export function InviteSection({ ws }: { ws: string }) {
  const { t } = useI18n();
  const i = t.invites;
  const id = useId();
  const headingId = useId();
  const now = useNow();
  const invitations = useInvitations(ws);
  const create = useCreateInvitation(ws);
  const resend = useResendInvitation(ws);
  const revoke = useRevokeInvitation(ws);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const fail = (error: unknown) => setProblem(errorText(error, t));
  const start = () => {
    setProblem(null);
    setFlash(null);
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    start();
    const address = email.trim();
    if (address === "") return setFieldError(t.auth.invalid.email);
    if (!EMAIL.test(address)) return setFieldError(t.auth.invalid.emailFormat);
    setFieldError(undefined);
    create.mutate(
      { email: address, name, isAdmin: role === "admin", groupId: null },
      {
        onSuccess: () => {
          setFlash(fill(i.sent, { email: address }));
          setEmail("");
          setName("");
          setRole("member");
        },
        onError: fail,
      },
    );
  }

  const pending = invitations.data?.items ?? [];

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 border-t pt-6">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-fg">
          {i.title}
        </h2>
        <p className="text-sm text-muted">{i.body}</p>
      </div>
      {invitations.data?.sandbox ? (
        <Notice tone="warning" icon={<FlaskConical aria-hidden />}>
          {i.sandbox}
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {flash ? (
        <div role="status">
          <Notice tone="success" icon={<Check aria-hidden />}>
            {flash}
          </Notice>
        </div>
      ) : null}
      <form onSubmit={submit} noValidate className="grid items-start gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]">
        <Field id={`${id}-email`} label={i.email} error={fieldError} required>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            autoComplete="off"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${id}-email-note` : undefined}
          />
        </Field>
        <Field id={`${id}-name`} label={i.name}>
          <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="off" />
        </Field>
        <Field id={`${id}-role`} label={i.role}>
          <Select
            id={`${id}-role`}
            value={role}
            onValueChange={setRole}
            options={[
              { value: "member", label: t.team.roleMember },
              { value: "admin", label: t.team.roleAdmin },
            ]}
          />
        </Field>
        <Button type="submit" variant="primary" icon={<MailPlus aria-hidden />} loading={create.isPending} className="md:mt-7">
          {i.submit}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-fg">{i.pendingTitle}</h3>
        {invitations.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-input px-4 py-4 text-sm text-muted">{i.pendingNone}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {pending.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    <span className="break-all">{invitation.email}</span>
                    {invitation.isAdmin ? <Badge tone="info">{t.team.roleAdmin}</Badge> : null}
                    {invitation.expired ? <Badge tone="warning">{i.expired}</Badge> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {invitation.name ? `${invitation.name} · ` : ""}
                    {fill(i.sentAgo, { time: formatAgo(invitation.lastSentAt, now, t.time) })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RotateCw aria-hidden />}
                    loading={resend.isPending && resend.variables === invitation.id}
                    aria-label={fill(i.resendLabel, { email: invitation.email })}
                    onClick={() => {
                      start();
                      resend.mutate(invitation.id, { onSuccess: () => setFlash(fill(i.resent, { email: invitation.email })), onError: fail });
                    }}
                  >
                    {i.resend}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X aria-hidden />}
                    loading={revoke.isPending && revoke.variables === invitation.id}
                    aria-label={fill(i.revokeLabel, { email: invitation.email })}
                    onClick={() => {
                      start();
                      revoke.mutate(invitation.id, { onSuccess: () => setFlash(fill(i.revoked, { email: invitation.email })), onError: fail });
                    }}
                  >
                    {i.revoke}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
