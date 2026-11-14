"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { useI18n } from "@/i18n";
import { ScreenHeader } from "./shell";

/** Ayarlar çerçevesi: başlık, alt menü ve seçili bölüm. */
export function SettingsFrame({ ws, children }: { ws: string; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const root = `/w/${ws}/settings`;
  const items = [
    { href: `${root}/workspace`, label: t.settingsNav.workspace },
    { href: `${root}/users`, label: t.settingsNav.users },
    { href: `${root}/profile`, label: t.settingsNav.profile },
    { href: `${root}/billing`, label: t.settingsNav.billing },
  ];
  return (
    <>
      <ScreenHeader title={t.nav.settings} />
      <nav aria-label={t.settingsNav.label} className="flex shrink-0 gap-1 overflow-x-auto border-b bg-bg px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors",
                active ? "bg-ink text-on-ink" : "text-muted hover:bg-surface-strong hover:text-fg",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 md:p-6">
        <div className="mx-auto w-full max-w-5xl rounded-lg border bg-bg shadow-card">{children}</div>
      </div>
    </>
  );
}
