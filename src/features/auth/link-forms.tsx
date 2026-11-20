"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { fill, useI18n } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { InvitationPreview } from "@/lib/types";
import { FormError, PasswordInput } from "./forms";

/** E-postadaki bağlantıyla açılan sayfaların ortak "bağlantı geçersiz" kutusu. */
function InvalidLink({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
        {message}
      </Notice>
      <Link href="/login" className={buttonClass({ variant: "secondary", className: "w-fit" })}>
        {t.auth.backToLogin}
      </Link>
    </div>
  );
}

/** Şifre sıfırlama bağlantısından gelen form: yeni şifre. */
export function ResetForm({ token }: { token: string | null }) {
  const { t } = useI18n();
  const a = t.auth;
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  const [dead, setDead] = useState(false);

  if (!token || dead) return <InvalidLink message={a.resetInvalid} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(undefined);
    if (password.length < 8) return setFieldError(a.invalid.password);
    setFieldError(undefined);
    setPending(true);
    try {
      const result = await api.post<{ redirect: string }>("/api/auth/reset", { token, password });
      window.location.assign(result.redirect);
    } catch (error) {
      if (error instanceof ApiError && error.code === "link_invalid") setDead(true);
      else setProblem(errorText(error, t));
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <FormError message={problem} />
      <Field id="reset-password" label={a.newPassword} hint={a.passwordHint} error={fieldError} required>
        <PasswordInput id="reset-password" value={password} onChange={setPassword} invalid={Boolean(fieldError)} autoComplete="new-password" describedBy="reset-password-note" />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
        {a.resetSubmit}
      </Button>
    </form>
  );
}

/** E-posta doğrulama bağlantısı: sayfa açılınca belirteç bir kez gönderilir ve sonuç gösterilir. */
export function VerifyPanel({ token }: { token: string | null }) {
  const { t } = useI18n();
  const a = t.auth;
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  // Geliştirmede etkiler iki kez çalışır; belirteç tek kullanımlık olduğu için istek yalnız bir kez atılır.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api
      .post<{ verified: boolean }>("/api/auth/verify", { token })
      .then(() => setState("done"))
      .catch(() => setState("failed"));
  }, [token]);

  if (state === "working") {
    return (
      <p aria-busy className="text-sm text-muted">
        {a.verifying}
      </p>
    );
  }
  if (state === "failed") return <InvalidLink message={a.verifyFailed} />;
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="success" icon={<Check aria-hidden />}>
        {a.verified}
      </Notice>
      <Link href="/login" className={buttonClass({ variant: "primary", className: "w-fit" })}>
        {a.backToLogin}
      </Link>
    </div>
  );
}

/** Davet bağlantısından gelen form. Hesabı olmayan davetli adını ve şifresini belirler; hesabı olan şifresini yazar. */
export function InviteForm({ token }: { token: string }) {
  const { t } = useI18n();
  const a = t.auth;
  const [preview, setPreview] = useState<InvitationPreview | null | "invalid">(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; password?: string; form?: string }>({});

  useEffect(() => {
    let alive = true;
    api
      .get<InvitationPreview>(`/api/invitations/${encodeURIComponent(token)}`)
      .then((data) => {
        if (!alive) return;
        setPreview(data);
        setName(data.name);
      })
      .catch(() => alive && setPreview("invalid"));
    return () => {
      alive = false;
    };
  }, [token]);

  if (preview === null) return <Skeleton className="h-40 w-full" />;
  if (preview === "invalid") return <InvalidLink message={a.inviteInvalid} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (preview === null || preview === "invalid") return;
    const next: typeof errors = {};
    if (!preview.hasAccount && name.trim() === "") next.name = a.invalid.name;
    if (preview.hasAccount ? password === "" : password.length < 8) next.password = preview.hasAccount ? a.invalid.passwordEmpty : a.invalid.password;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setPending(true);
    try {
      const result = await api.post<{ redirect: string }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { name, password });
      window.location.assign(result.redirect);
    } catch (error) {
      if (error instanceof ApiError && error.code === "link_invalid") setPreview("invalid");
      else setErrors({ form: errorText(error, t) });
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <p className="rounded-md border bg-surface px-3 py-2 text-sm text-fg">
        {preview.inviterName ? fill(a.inviteFrom, { inviter: preview.inviterName, workspace: preview.workspaceName }) : fill(a.inviteTo, { workspace: preview.workspaceName })}{" "}
        {fill(a.inviteEmail, { email: preview.email })}
      </p>
      <FormError message={errors.form} />
      {preview.hasAccount ? (
        <p className="text-sm text-muted">{a.inviteExisting}</p>
      ) : (
        <Field id="invite-name" label={a.name} error={errors.name} required>
          <Input id="invite-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "invite-name-note" : undefined} />
        </Field>
      )}
      <Field id="invite-password" label={a.password} hint={preview.hasAccount ? undefined : a.passwordHint} error={errors.password} required>
        <PasswordInput
          id="invite-password"
          value={password}
          onChange={setPassword}
          invalid={Boolean(errors.password)}
          autoComplete={preview.hasAccount ? "current-password" : "new-password"}
          describedBy={preview.hasAccount && !errors.password ? undefined : "invite-password-note"}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
        {a.inviteSubmit}
      </Button>
    </form>
  );
}
