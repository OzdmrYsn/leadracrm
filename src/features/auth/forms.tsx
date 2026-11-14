"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, MailCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<Record<"name" | "email" | "password" | "workspace" | "form", string>>;

/** Şifre alanı: göster/gizle düğmesiyle. */
function PasswordInput({ id, value, onChange, invalid, autoComplete, describedBy }: { id: string; value: string; onChange: (value: string) => void; invalid: boolean; autoComplete: string; describedBy?: string }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        maxLength={200}
        required
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setShown((current) => !current)}
        aria-label={shown ? t.auth.hidePassword : t.auth.showPassword}
        aria-pressed={shown}
        className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-strong hover:text-fg"
      >
        {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  return message ? (
    <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
      {message}
    </Notice>
  ) : null;
}

/** Sunucu yönlendirme adresini döndürür; oturum çerezi tam sayfa geçişle devreye girer. */
function useSubmit(path: string) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  async function send(body: unknown) {
    setPending(true);
    try {
      const result = await api.post<{ redirect: string }>(path, body);
      window.location.assign(result.redirect);
    } catch (problem) {
      setErrors({ form: errorText(problem, t) });
      setPending(false);
    }
  }
  return { pending, errors, setErrors, send };
}

export function SignupForm() {
  const { t } = useI18n();
  const a = t.auth;
  const { pending, errors, setErrors, send } = useSubmit("/api/auth/signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (name.trim() === "") next.name = a.invalid.name;
    if (email.trim() === "") next.email = a.invalid.email;
    else if (!EMAIL.test(email.trim())) next.email = a.invalid.emailFormat;
    if (password.length < 8) next.password = a.invalid.password;
    if (workspace.trim() === "") next.workspace = a.invalid.workspace;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    void send({ name, email, password, workspaceName: workspace });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormError message={errors.form} />
      <Field id="signup-name" label={a.name} error={errors.name} required>
        <Input id="signup-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={120} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "signup-name-note" : undefined} required autoFocus />
      </Field>
      <Field id="signup-email" label={a.email} error={errors.email} required>
        <Input id="signup-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "signup-email-note" : undefined} required />
      </Field>
      <Field id="signup-password" label={a.password} hint={a.passwordHint} error={errors.password} required>
        <PasswordInput id="signup-password" value={password} onChange={setPassword} invalid={Boolean(errors.password)} autoComplete="new-password" describedBy="signup-password-note" />
      </Field>
      <Field id="signup-workspace" label={a.workspace} hint={a.workspaceHint} error={errors.workspace} required>
        <Input id="signup-workspace" value={workspace} onChange={(event) => setWorkspace(event.target.value)} autoComplete="organization" maxLength={120} aria-invalid={errors.workspace ? true : undefined} aria-describedby="signup-workspace-note" required />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
        {a.signupSubmit}
      </Button>
    </form>
  );
}

export function LoginForm() {
  const { t } = useI18n();
  const a = t.auth;
  const { pending, errors, setErrors, send } = useSubmit("/api/auth/login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (email.trim() === "") next.email = a.invalid.email;
    else if (!EMAIL.test(email.trim())) next.email = a.invalid.emailFormat;
    if (password === "") next.password = a.invalid.passwordEmpty;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    void send({ email, password });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormError message={errors.form} />
      <Field id="login-email" label={a.email} error={errors.email} required>
        <Input id="login-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "login-email-note" : undefined} required autoFocus />
      </Field>
      <Field id="login-password" label={a.password} error={errors.password} required>
        <PasswordInput id="login-password" value={password} onChange={setPassword} invalid={Boolean(errors.password)} autoComplete="current-password" describedBy={errors.password ? "login-password-note" : undefined} />
      </Field>
      <Link href="/forgot" className="w-fit text-sm font-medium text-accent underline underline-offset-4 hover:text-accent-hover">
        {a.forgotLink}
      </Link>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
        {a.loginSubmit}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const a = t.auth;
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<"sent" | "unavailable" | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (email.trim() === "" || !EMAIL.test(email.trim())) {
      setErrors({ email: email.trim() === "" ? a.invalid.email : a.invalid.emailFormat });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await api.post<{ sent: boolean }>("/api/auth/forgot", { email });
      setResult(response.sent ? "sent" : "unavailable");
    } catch (problem) {
      setErrors({ form: errorText(problem, t) });
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <Notice tone={result === "sent" ? "success" : "warning"} icon={result === "sent" ? <MailCheck aria-hidden /> : <TriangleAlert aria-hidden />}>
        {result === "sent" ? a.forgotSent : a.forgotUnavailable}
      </Notice>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
      <FormError message={errors.form} />
      <Field id="forgot-email" label={a.email} error={errors.email} required>
        <Input id="forgot-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "forgot-email-note" : undefined} required autoFocus />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-2 w-full">
        {a.forgotSubmit}
      </Button>
    </form>
  );
}
