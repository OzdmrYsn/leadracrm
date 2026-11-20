"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FlaskConical, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog, DialogClose } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import { daysLeft, MAX_SEATS, periodTotal, type Billing, type BillingPeriod, type SubscriptionState } from "@/lib/billing";
import { errorText } from "@/lib/errors";
import { formatDate, formatMoney } from "@/lib/format";
import { useBilling, useCancelSubscription, useChangeSeats, useNow, useResumeSubscription, useSession, useStartCheckout } from "@/lib/hooks";
import type { Workspace } from "@/lib/types";

const TONE: Record<SubscriptionState, "info" | "success" | "warning" | "danger"> = { trialing: "info", active: "success", past_due: "warning", expired: "danger", canceled: "danger" };

function seatValue(text: string): number | null {
  const value = Number(text);
  return /^\d{1,3}$/.test(text.trim()) && value >= 1 && value <= MAX_SEATS ? value : null;
}

/** Abonelik başlatma formu: koltuk sayısı ve ödeme dönemi. Ödeme, sağlayıcının sayfasında yapılır. */
function SubscribeForm({ ws, billing, workspace }: { ws: string; billing: Billing; workspace: Workspace }) {
  const { t } = useI18n();
  const b = t.billing;
  const id = useId();
  const checkout = useStartCheckout(ws);
  const { subscription, price } = billing;
  const [seats, setSeats] = useState(String(Math.max(subscription.seatsUsed, 1)));
  const [period, setPeriod] = useState<BillingPeriod>("month");
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const count = seatValue(seats);
  const seatError = !submitted ? undefined : count === null ? b.seatsInvalid : count < subscription.seatsUsed ? fill(b.seatsBelow, { count: subscription.seatsUsed }) : undefined;
  const money = (minor: number) => formatMoney(minor, price.currency, workspace.locale);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setProblem(null);
    if (count === null || count < subscription.seatsUsed) return;
    checkout.mutate({ seats: count, period }, { onSuccess: ({ url }) => window.location.assign(url), onError: (error) => setProblem(errorText(error, t)) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      <Field id={`${id}-seats`} label={b.seats} hint={fill(b.seatsHint, { count: subscription.seatsUsed })} error={seatError} required>
        <Input
          id={`${id}-seats`}
          inputMode="numeric"
          value={seats}
          onChange={(event) => setSeats(event.target.value)}
          maxLength={3}
          className="max-w-32"
          aria-invalid={seatError ? true : undefined}
          aria-describedby={`${id}-seats-note`}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-sm font-medium text-fg">{b.period}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["month", "year"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "relative flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                period === option ? "border-accent bg-accent-soft" : "border-border-input bg-bg hover:bg-surface",
              )}
            >
              {/* Seçim düğmesi kartın tamamını kaplar (dokunma hedefi kart kadardır); görünen işaret yanındaki dairedir. */}
              <input
                type="radio"
                name={`${id}-period`}
                value={option}
                checked={period === option}
                onChange={() => setPeriod(option)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span aria-hidden className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-pill border-2", period === option ? "border-accent" : "border-border-input")}>
                {period === option ? <span className="size-2 rounded-pill bg-accent" /> : null}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">{b.periods[option]}</span>
                <span className="text-xs text-muted">{option === "year" ? fill(b.yearNote, { months: 12 - price.yearMonths }) : b.monthNote}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1 rounded-md border bg-surface px-4 py-3">
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted">{fill(b.perSeat, { price: money(price.seatMonthlyMinor) })}</span>
          <span className="font-display text-xl text-fg tabular-nums">
            {count !== null ? fill(period === "year" ? b.totalYear : b.totalMonth, { total: money(periodTotal(price, count, period)) }) : "—"}
          </span>
        </p>
        {price.provisional ? <p className="text-xs text-warning">{b.provisional}</p> : null}
      </div>
      {!billing.canPay ? <Notice tone="info">{b.noProvider}</Notice> : null}
      {billing.sandbox ? (
        <Notice tone="warning" icon={<FlaskConical aria-hidden />}>
          {b.sandbox}
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={checkout.isPending} disabled={!billing.canPay}>
          {b.goToPayment}
        </Button>
      </div>
    </form>
  );
}

/** Etkin abonelik: koltuk sayısını değiştirme ve tek tıkla iptal. */
function ManageForm({ ws, billing, workspace, onFlash }: { ws: string; billing: Billing; workspace: Workspace; onFlash: (text: string | null) => void }) {
  const { t } = useI18n();
  const b = t.billing;
  const id = useId();
  const change = useChangeSeats(ws);
  const cancel = useCancelSubscription(ws);
  const resume = useResumeSubscription(ws);
  const { subscription } = billing;
  const [seats, setSeats] = useState(String(subscription.seats));
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  const count = seatValue(seats);
  const seatError = !submitted ? undefined : count === null ? b.seatsInvalid : count < subscription.seatsUsed ? fill(b.seatsBelow, { count: subscription.seatsUsed }) : undefined;
  const end = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd, workspace.locale, workspace.timezone, workspace.dateFormat) : "";
  const fail = (error: unknown) => setProblem(errorText(error, t));

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setProblem(null);
    onFlash(null);
    if (count === null || count < subscription.seatsUsed) return;
    // Sonuç gelince bu form yeni koltuk sayısıyla yeniden kurulur; bildirim bu yüzden üst bileşende durur.
    change.mutateAsync(count).then(() => onFlash(fill(b.seatsSaved, { count })), fail);
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {subscription.state === "active" ? (
        <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
          <Field id={`${id}-seats`} label={b.seats} hint={fill(b.seatsHint, { count: subscription.seatsUsed })} error={seatError} required>
            <Input
              id={`${id}-seats`}
              inputMode="numeric"
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
              maxLength={3}
              className="max-w-32"
              aria-invalid={seatError ? true : undefined}
              aria-describedby={`${id}-seats-note`}
            />
          </Field>
          <Button type="submit" loading={change.isPending} disabled={count === subscription.seats} className="mb-6">
            {b.updateSeats}
          </Button>
        </form>
      ) : null}
      <div className="flex flex-col gap-2 border-t pt-4">
        {subscription.cancelAtPeriodEnd ? (
          <>
            <p className="text-sm text-fg">{fill(b.canceledUntil, { date: end })}</p>
            <div>
              <Button
                loading={resume.isPending}
                onClick={() => {
                  onFlash(null);
                  resume.mutateAsync(undefined).then(() => onFlash(b.resumed), fail);
                }}
              >
                {b.resume}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">{b.cancelNote}</p>
            <div>
              <Button ref={cancelButton} variant="ghost" onClick={() => setConfirming(true)}>
                {b.cancel}
              </Button>
            </div>
          </>
        )}
      </div>
      <Dialog
        title={b.cancelTitle}
        description={fill(b.cancelBody, { date: end })}
        closeLabel={t.common.close}
        open={confirming}
        onOpenChange={setConfirming}
        returnFocusTo={cancelButton}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">{b.keep}</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={cancel.isPending}
              onClick={() => {
                onFlash(null);
                cancel.mutateAsync(undefined).then(
                  () => setConfirming(false),
                  (error) => {
                    fail(error);
                    setConfirming(false);
                  },
                );
              }}
            >
              {b.cancelConfirm}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}

/** Ayarlar › Faturalandırma: abonelik durumu, koltuklar, ödeme dönemi, iptal ve faturalar. */
export function BillingScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const b = t.billing;
  const headingId = useId();
  const invoicesId = useId();
  const session = useSession(ws);
  const isAdmin = session.data?.user.isAdmin ?? false;
  const billing = useBilling(ws, isAdmin);
  const now = useNow();
  const router = useRouter();
  const returned = useSearchParams().get("checkout");
  const [notice] = useState(returned);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (returned) router.replace(`/w/${ws}/settings/billing`);
  }, [returned, router, ws]);

  if (session.isPending || (isAdmin && billing.isPending)) {
    return (
      <div aria-busy className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full max-w-xl" />
      </div>
    );
  }
  if (!session.data || (isAdmin && !billing.data)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<TriangleAlert />}
          title={t.common.loadFailed}
          action={
            <Button variant="secondary" onClick={() => void (session.data ? billing.refetch() : session.refetch())}>
              {t.common.retry}
            </Button>
          }
        />
      </div>
    );
  }

  const workspace = session.data.workspace;
  const subscription = billing.data?.subscription ?? session.data.subscription;
  const date = (iso: string | null) => (iso ? formatDate(iso, workspace.locale, workspace.timezone, workspace.dateFormat) : "");
  const detail: Record<SubscriptionState, string> = {
    trialing: fill(b.detail.trialing, { days: daysLeft(subscription.trialEndsAt, now), date: date(subscription.trialEndsAt) }),
    active: subscription.cancelAtPeriodEnd
      ? fill(b.canceledUntil, { date: date(subscription.currentPeriodEnd) })
      : fill(b.detail.active, { period: subscription.period ? b.periods[subscription.period] : "", date: date(subscription.currentPeriodEnd) }),
    past_due: b.detail.past_due,
    expired: b.detail.expired,
    canceled: b.detail.canceled,
  };

  return (
    <div className="flex flex-col gap-8 p-4">
      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {b.title}
          </h2>
          <p className="text-sm text-muted">{b.body}</p>
        </div>
        {notice === "success" ? (
          <Notice tone="success" icon={<Check aria-hidden />}>
            {b.paid}
          </Notice>
        ) : notice === "canceled" ? (
          <Notice tone="warning" icon={<Info aria-hidden />}>
            {b.notPaid}
          </Notice>
        ) : null}
        {flash ? (
          <div role="status" className="max-w-xl">
            <Notice tone="success" icon={<Check aria-hidden />}>
              {flash}
            </Notice>
          </div>
        ) : null}
        <div className="flex max-w-xl flex-wrap items-start justify-between gap-4 rounded-lg border px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p>
              <Badge tone={TONE[subscription.state]}>{b.states[subscription.state]}</Badge>
            </p>
            <p className="text-sm text-fg">{detail[subscription.state]}</p>
          </div>
          <p className="flex flex-col text-right">
            <span className="text-xs text-muted">{b.seatsUsedLabel}</span>
            <span className="font-display text-lg text-fg tabular-nums">{fill(b.seatsUsed, { used: subscription.seatsUsed, seats: subscription.seats })}</span>
          </p>
        </div>
        {!isAdmin || !billing.data ? (
          <Notice tone="info">{b.adminOnly}</Notice>
        ) : subscription.state === "active" || (subscription.state === "past_due" && subscription.cancelAtPeriodEnd) ? (
          <ManageForm key={`${subscription.seats}-${subscription.cancelAtPeriodEnd}`} ws={ws} billing={billing.data} workspace={workspace} onFlash={setFlash} />
        ) : (
          <SubscribeForm ws={ws} billing={billing.data} workspace={workspace} />
        )}
        <ul className="flex max-w-xl flex-col gap-1.5 border-t pt-4 text-sm text-muted">
          {b.promises.map((promise) => (
            <li key={promise} className="flex items-start gap-2">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              {promise}
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && billing.data ? (
        <section aria-labelledby={invoicesId} className="flex flex-col gap-3">
          <h2 id={invoicesId} className="text-base font-semibold text-fg">
            {b.invoices}
          </h2>
          {billing.data.invoices.length === 0 ? (
            <p className="max-w-xl rounded-lg border border-dashed border-border-input px-4 py-5 text-sm text-muted">{b.noInvoices}</p>
          ) : (
            <div className="max-w-2xl overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">{b.colDate}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{b.colDetail}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{b.colAmount}</th>
                    <th scope="col" className="px-3 py-2 font-medium">{b.colStatus}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {billing.data.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-3 py-2 text-fg">{date(invoice.createdAt)}</td>
                      <td className="px-3 py-2 text-muted">{fill(b.invoiceDetail, { seats: invoice.seats, period: b.periods[invoice.period] })}</td>
                      <td className="px-3 py-2 text-right font-medium text-fg tabular-nums">{formatMoney(invoice.amountMinor, invoice.currency, workspace.locale)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={invoice.status === "paid" ? "success" : "danger"}>{b.invoiceStatus[invoice.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
