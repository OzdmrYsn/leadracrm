"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import { useI18n } from "@/i18n";
import type { Id, User } from "@/lib/types";
import { ScreenHeader } from "./shell";

const UNASSIGNED = "none";

/** Kayıt kartından listeye dönüş. */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg transition-colors hover:bg-surface-strong"
    >
      <ArrowLeft aria-hidden className="size-4" />
    </Link>
  );
}

export function RecordPending({ back }: { back: ReactNode }) {
  const { t } = useI18n();
  return (
    <>
      <ScreenHeader title={t.common.loading} before={back} />
      <div aria-busy className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-2/3" />
      </div>
    </>
  );
}

/** Kayıt bulunamadı ya da yüklenemedi. Bulunamadıysa listeye döndürür, yüklenemediyse yeniden denetir. */
export function RecordProblem({
  title,
  back,
  missing,
  listHref,
  listLabel,
  onRetry,
}: {
  title: string;
  back: ReactNode;
  missing: boolean;
  listHref: string;
  listLabel: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <ScreenHeader title={title} before={back} />
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<TriangleAlert />}
          title={missing ? t.common.notFound : t.common.loadFailed}
          action={
            missing ? (
              <Link href={listHref} className="text-sm font-medium text-fg underline underline-offset-4">
                {listLabel}
              </Link>
            ) : (
              <Button variant="secondary" onClick={onRetry}>
                {t.common.retry}
              </Button>
            )
          }
        />
      </div>
    </>
  );
}

/** Sorumlu seçimi. null "atanmamış" demektir. */
export function ResponsibleSelect({
  id,
  value,
  users,
  disabled,
  onChange,
}: {
  id: string;
  value: Id | null;
  users: User[];
  disabled?: boolean;
  onChange: (userId: Id | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <label htmlFor={id} className="text-xs text-muted">
        {t.lead.responsible}
      </label>
      <Select
        id={id}
        value={value ?? UNASSIGNED}
        disabled={disabled}
        options={[...users.map((user) => ({ value: user.id, label: user.name })), { value: UNASSIGNED, label: t.common.unassigned }]}
        onValueChange={(next) => onChange(next === UNASSIGNED ? null : next)}
      />
    </div>
  );
}

/** Kartın sağ sütunundaki başlıklı bölüm. */
export function RecordSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
