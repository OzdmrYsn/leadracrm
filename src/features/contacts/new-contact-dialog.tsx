"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { CompanyPicker } from "@/features/companies/company-picker";
import { useI18n } from "@/i18n";
import { ApiError } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useCreateContact } from "@/lib/hooks";
import type { Id } from "@/lib/types";

type Errors = { name?: string; phone?: string; email?: string; form?: string };

function NewContactForm({ ws, locale, onDone }: { ws: string; locale: string; onDone: () => void }) {
  const { t } = useI18n();
  const create = useCreateContact(ws);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState<{ id: Id; name: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  // Alan düzeltilirken eski hata metni ekranda kalmasın.
  const clear = (field: keyof Errors) => setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") {
      setErrors({ name: t.contacts.nameRequired });
      return;
    }
    setErrors({});
    create.mutate(
      { name, phone: phone.trim() || undefined, email: email.trim() || undefined, companyId: company?.id ?? null },
      {
        onSuccess: onDone,
        onError: (problem) => {
          const text = errorText(problem, t);
          const code = problem instanceof ApiError ? problem.code : "";
          setErrors(code === "invalid_phone" ? { phone: text } : code === "invalid_email" ? { email: text } : { form: text });
        },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.form ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {errors.form}
        </Notice>
      ) : null}
      <Field id="contact-name" label={t.contacts.name} error={errors.name} required>
        <Input
          id="contact-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            clear("name");
          }}
          maxLength={255}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          required
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contact-phone" label={t.contacts.phone} error={errors.phone}>
          <Input
            id="contact-phone"
            type="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              clear("phone");
            }}
            maxLength={32}
            autoComplete="off"
            aria-invalid={errors.phone ? true : undefined}
          />
        </Field>
        <Field id="contact-email" label={t.contacts.email} error={errors.email}>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clear("email");
            }}
            maxLength={255}
            autoComplete="off"
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">{t.contacts.company}</span>
        <div className="flex flex-wrap items-center gap-2">
          {company ? <span className="min-w-0 truncate text-sm text-fg">{company.name}</span> : null}
          <CompanyPicker
            ws={ws}
            locale={locale}
            onPick={async (id, pickedName) => setCompany({ id, name: pickedName })}
            trigger={<Button size="sm">{company ? t.company.change : t.company.link}</Button>}
          />
          {company ? (
            <Button variant="ghost" size="sm" onClick={() => setCompany(null)}>
              {t.company.unlink}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t.contacts.submit}
        </Button>
      </div>
    </form>
  );
}

export function NewContactDialog({
  ws,
  locale,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={t.contacts.newTitle} closeLabel={t.common.close} open={open} onOpenChange={onOpenChange} returnFocusTo={returnFocusTo}>
      <NewContactForm ws={ws} locale={locale} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
