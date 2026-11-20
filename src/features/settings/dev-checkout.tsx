"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { fill } from "@/i18n/fill";
import { tr } from "@/i18n/tr";
import { formatMoney } from "@/lib/format";

type Session = { seats: number; period: "month" | "year"; amountMinor: number; currency: string; status: "open" | "paid" | "declined" };

/** Ödeme taklidinin sayfası: gerçek sağlayıcının ödeme sayfasının yerini tutar. Kart sorulmaz, para çekilmez. */
export function DevCheckout({ sessionId }: { sessionId: string }) {
  const t = tr.billing.dev;
  const [session, setSession] = useState<Session | null | "missing">(null);
  const [busy, setBusy] = useState<"pay" | "decline" | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/dev/billing/session/${encodeURIComponent(sessionId)}`)
      .then((response) => (response.ok ? (response.json() as Promise<Session>) : null))
      .then((data) => alive && setSession(data ?? "missing"))
      .catch(() => alive && setSession("missing"));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  async function settle(paid: boolean) {
    setBusy(paid ? "pay" : "decline");
    const response = await fetch("/api/dev/billing/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, paid }) });
    if (!response.ok) return setSession("missing");
    window.location.assign(((await response.json()) as { returnUrl: string }).returnUrl);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-lg border bg-bg p-6">
        <h1 className="text-lg text-fg">{t.title}</h1>
        <Notice tone="warning" icon={<FlaskConical aria-hidden />}>
          {t.notice}
        </Notice>
        {session === null ? (
          <p aria-busy className="text-sm text-muted">
            {tr.common.loading}
          </p>
        ) : session === "missing" || session.status !== "open" ? (
          <p className="text-sm text-fg">{t.closed}</p>
        ) : (
          <>
            <dl className="flex flex-col divide-y rounded-md border text-sm">
              <div className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-muted">{tr.billing.seats}</dt>
                <dd className="font-medium text-fg tabular-nums">{session.seats}</dd>
              </div>
              <div className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-muted">{tr.billing.period}</dt>
                <dd className="font-medium text-fg">{tr.billing.periods[session.period]}</dd>
              </div>
              <div className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-muted">{t.total}</dt>
                <dd className="font-semibold text-fg tabular-nums">{formatMoney(session.amountMinor, session.currency, "tr-TR")}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" loading={busy === "decline"} disabled={busy !== null} onClick={() => void settle(false)}>
                {t.decline}
              </Button>
              <Button variant="primary" loading={busy === "pay"} disabled={busy !== null} onClick={() => void settle(true)}>
                {fill(t.pay, { amount: formatMoney(session.amountMinor, session.currency, "tr-TR") })}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
