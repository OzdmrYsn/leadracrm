"use client";

import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import type { Messages } from "@/i18n/tr";
import { ScreenHeader } from "./shell";

export type StubKey = keyof Messages["screens"];

/**
 * Henüz kurulmamış ekranın yer tutucusu: ne olacağını ve hangi adımda geleceğini söyler.
 * mode: "screen" kabuğun içinde, "page" kabuksuz tam sayfa, "section" başka bir çerçevenin içinde.
 */
export function ScreenStub({ screen, mode = "screen" }: { screen: StubKey; mode?: "screen" | "page" | "section" }) {
  const { t } = useI18n();
  const copy = t.screens[screen];
  const body = (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={<Hammer />}
        title={mode === "section" ? copy.title : t.stub.body}
        body={`${mode === "section" ? `${t.stub.body} ` : ""}${copy.body} ${fill(t.stub.milestone, { milestone: copy.milestone })}`}
        action={<Badge tone="info">{t.stub.badge}</Badge>}
      />
    </div>
  );
  if (mode === "section") return body;
  if (mode === "page") {
    return (
      <main className="flex min-h-dvh flex-col">
        <ScreenHeader title={copy.title} />
        {body}
      </main>
    );
  }
  return (
    <>
      <ScreenHeader title={copy.title} />
      {body}
    </>
  );
}
