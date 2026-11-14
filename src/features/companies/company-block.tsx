"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fill, useI18n } from "@/i18n";
import type { Id } from "@/lib/types";
import { CompanyPicker } from "./company-picker";

/** Bir kaydın bağlı şirketi: karta bağlantı, değiştirme ve ayırma. Ayırmak şirketi silmez. */
export function CompanyBlock({
  ws,
  locale,
  company,
  disabled,
  onChange,
}: {
  ws: string;
  locale: string;
  company: { id: Id; name: string } | null;
  disabled?: boolean;
  onChange: (companyId: Id | null) => Promise<unknown>;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs text-muted">{t.company.label}</h2>
      {company ? (
        <div className="flex flex-col items-start gap-2">
          <Link href={`/w/${ws}/companies/${company.id}`} className="max-w-full rounded-sm text-sm font-medium break-words text-fg underline underline-offset-4">
            {company.name}
          </Link>
          <div className="flex flex-wrap gap-2">
            <CompanyPicker
              ws={ws}
              locale={locale}
              onPick={(companyId) => onChange(companyId)}
              trigger={
                <Button size="sm" disabled={disabled}>
                  {t.company.change}
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={fill(t.company.unlinkLabel, { name: company.name })}
              onClick={() => void onChange(null).catch(() => undefined)}
            >
              {t.company.unlink}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">{t.company.none}</p>
          <CompanyPicker
            ws={ws}
            locale={locale}
            onPick={(companyId) => onChange(companyId)}
            trigger={
              <Button size="sm" icon={<Building2 aria-hidden />}>
                {t.company.link}
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
