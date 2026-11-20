"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChartColumn, TriangleAlert } from "lucide-react";
import { ScreenHeader } from "@/components/app/shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import { eventText } from "@/features/chat/feed";
import { fill, useI18n } from "@/i18n";
import { formatAgo, formatMoney } from "@/lib/format";
import { useInsights, useNow, useSession } from "@/lib/hooks";
import type { Insights } from "@/lib/types";

const RANGES = [7, 30, 65] as const;
const EVERYONE = "all";

const shortDay = (day: string, locale: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** Eksenin üst değeri: en büyük değerin üstündeki ilk "temiz" sayı (1, 2, 5, 10, 20, 50 ...). */
function niceTop(max: number): number {
  if (max <= 4) return Math.max(1, max);
  const power = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((step) => step * power).find((value) => value >= max) ?? max;
}

function Card({ title, body, children, className }: { title: string; body?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-bg p-4 shadow-card", className)}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {body ? <p className="text-xs text-muted">{body}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Tek bir güncel sayı: etiket, değer ve isteğe bağlı açıklama. Grafik değildir. */
function Tile({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: 1 | 2 | 4 | 5 | 6 | 7 }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-bg p-4 shadow-card">
      <dt className="flex items-center gap-2 text-sm text-muted">
        {/* Süs: kutuları göz ucuyla ayırt etmeye yarar; anlamı etiket taşır. */}
        <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--stage-strong-${tone})` }} />
        {label}
      </dt>
      <dd className="text-xl text-fg">{value}</dd>
      {detail ? <dd className="truncate text-xs text-muted">{detail}</dd> : null}
    </div>
  );
}

/**
 * Günlük sütunlar: tek seri, tek renk. Sütun en çok 24 piksel kalındır, ucu yuvarlak, tabanı düzdür.
 * Üzerine gelince günün değeri görünür; aynı veri altındaki tabloda da vardır (klavye ve ekran okuyucu için).
 */
function DailyChart({ data, locale }: { data: Insights["daily"]; locale: string }) {
  const { t } = useI18n();
  const top = niceTop(Math.max(...data.map((point) => point.created)));
  const ticks = top % 2 === 0 ? [top, top / 2, 0] : [top, 0];
  const total = data.reduce((sum, point) => sum + point.created, 0);
  const peak = data.reduce((best, point) => (point.created > best.created ? point : best), data[0]);
  const from = shortDay(data[0].day, locale);
  const to = shortDay(data[data.length - 1].day, locale);
  const summary = total === 0 ? fill(t.insights.dailyNone, { from, to }) : fill(t.insights.dailySummary, { from, to, total, peakDay: shortDay(peak.day, locale), peak: peak.created });

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-xs text-muted">{summary}</figcaption>
      <div role="img" aria-label={summary} className="flex gap-2">
        <div aria-hidden className="flex h-40 w-6 shrink-0 flex-col justify-between text-right text-xs text-muted tabular-nums">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0 leading-none">
              {tick}
            </span>
          ))}
        </div>
        <div aria-hidden className="relative h-40 min-w-0 flex-1">
          {ticks.map((tick) => (
            <span key={tick} className="absolute inset-x-0 border-t border-chart-grid" style={{ bottom: `${(tick / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {data.map((point, index) => (
              // Sütunun tamamı (boş kısmı dahil) imleç alanıdır; değer küçük olsa da üzerine gelmek kolaydır.
              <div key={point.day} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                <div className="w-full max-w-6 rounded-t-sm bg-chart-1 transition-opacity group-hover:opacity-70" style={{ height: `${(point.created / top) * 100}%` }} />
                <div
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md border bg-bg px-2 py-1 text-xs whitespace-nowrap shadow-pop group-hover:block",
                    index < data.length / 3 ? "left-0" : index > (data.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  <span className="block font-semibold text-fg">{fill(t.insights.leadCount, { count: point.created })}</span>
                  <span className="block text-muted">{shortDay(point.day, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden className="flex justify-between pl-8 text-xs text-muted">
        <span>{from}</span>
        <span>{to}</span>
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer rounded-sm text-muted hover:text-fg">{t.insights.dailyTable}</summary>
        {/* Kaydırılabilir alan klavyeyle de kaydırılabilsin diye odaklanabilir. */}
        <div tabIndex={0} role="region" aria-label={`${t.insights.dailyTitle}: ${t.insights.dailyTable}`} className="mt-2 max-h-60 overflow-y-auto rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-1 font-medium">
                  {t.insights.colDay}
                </th>
                <th scope="col" className="px-3 py-1 text-right font-medium">
                  {t.insights.created}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.day} className="border-t">
                  <th scope="row" className="px-3 py-1 font-normal text-fg">
                    {shortDay(point.day, locale)}
                  </th>
                  <td className="px-3 py-1 text-right text-fg tabular-nums">{point.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Ad, çubuk ve sayı: her satırın değeri yanında yazar, çubuklar aynı tabandan başlar. Tek renk: büyüklük karşılaştırması. */
function BarList({ rows }: { rows: Array<{ key: string; name: string; count: number; detail?: string }> }) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm text-fg">{row.name}</span>
          <span className="text-sm text-fg tabular-nums">
            {fill(t.insights.leadCount, { count: row.count })}
            {row.detail ? <span className="text-muted"> · {row.detail}</span> : null}
          </span>
          <span aria-hidden className="col-span-2 block h-2">
            <span className="block h-full rounded-r-sm bg-chart-1" style={{ width: `${(row.count / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tek bir oran: dolu kısım ve aynı tonun açık adımındaki zemin. */
function WinRate({ won, lost }: { won: number; lost: number }) {
  const { t } = useI18n();
  const id = useId();
  const closed = won + lost;
  if (closed === 0) return <p className="text-sm text-muted">{t.insights.winRateNone}</p>;
  const rate = Math.round((won / closed) * 100);
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="text-xl text-fg">
        %{rate}
      </p>
      <div role="meter" aria-labelledby={id} aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate} aria-valuetext={`%${rate}`} className="h-2 overflow-hidden rounded-pill bg-chart-track">
        <div className="h-full rounded-pill bg-chart-1" style={{ width: `${rate}%` }} />
      </div>
      <p className="text-xs text-muted">{fill(t.insights.winRateDetail, { won, closed })}</p>
    </div>
  );
}

/** Raporlar: dönem özeti, günlük yeni lead'ler, aşama dağılımı, kayıp nedenleri, kişilere göre sonuçlar, son etkinlikler. */
export function InsightsScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const session = useSession(ws);
  const now = useNow();
  const [days, setDays] = useState<number>(30);
  const [responsible, setResponsible] = useState(EVERYONE);
  const insights = useInsights(ws, days, responsible === EVERYONE ? "" : responsible);

  const locale = session.data?.workspace.locale ?? "tr-TR";
  const currency = session.data?.workspace.currency ?? "TRY";
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const data = insights.data;
  // Boş durum yalnız süzgeçsiz görünümde: süzgeçle sıfır çıkması "veri yok" demek değildir.
  const empty = data && responsible === EVERYONE ? data.totals.created + data.totals.won + data.totals.lost + data.totals.open === 0 && data.events.length === 0 : false;

  return (
    <>
      <ScreenHeader title={t.insights.title} />
      {/* Süzgeçler tek satırda, kapsadıkları her şeyin üstünde durur; altındaki bütün sayılar aynı dilimi gösterir. */}
      <div role="group" aria-label={t.insights.filters} className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-bg px-3 py-2">
        <div className="w-40">
          <Select
            aria-label={t.insights.range}
            value={String(days)}
            onValueChange={(next) => setDays(Number(next))}
            options={RANGES.map((value) => ({ value: String(value), label: t.insights.ranges[value] }))}
          />
        </div>
        <div className="w-48">
          <Select
            aria-label={t.insights.responsible}
            value={responsible}
            onValueChange={setResponsible}
            options={[
              { value: EVERYONE, label: t.insights.everyone },
              ...(session.data?.users ?? []).map((user) => ({ value: user.id, label: user.name })),
              { value: "none", label: t.common.unassigned },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {insights.isPending ? (
          <div aria-busy className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : insights.isError || !data ? (
          <EmptyState
            icon={<TriangleAlert />}
            title={t.common.loadFailed}
            action={
              <Button variant="secondary" onClick={() => void insights.refetch()}>
                {t.common.retry}
              </Button>
            }
          />
        ) : empty ? (
          <EmptyState icon={<ChartColumn />} title={t.insights.emptyTitle} body={t.insights.emptyBody} />
        ) : (
          // Yeni dönem yüklenirken eski rapor yerinde, soluk durur: düzen sıçramaz.
          <div className={cn("flex flex-col gap-4 p-4 transition-opacity", insights.isPlaceholderData && "opacity-60")}>
            <section aria-label={t.insights.summary}>
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <Tile tone={1} label={t.insights.created} value={String(data.totals.created)} />
                <Tile tone={4} label={t.insights.won} value={String(data.totals.won)} detail={money(data.totals.wonMinor)} />
                <Tile tone={6} label={t.insights.lost} value={String(data.totals.lost)} detail={money(data.totals.lostMinor)} />
                <Tile tone={7} label={t.insights.open} value={String(data.totals.open)} detail={`${money(data.totals.openMinor)} · ${t.insights.openNow}`} />
                <Tile tone={5} label={t.insights.tasksDone} value={String(data.totals.tasksDone)} />
                <Tile tone={2} label={t.insights.tasksOverdue} value={String(data.totals.tasksOverdue)} detail={t.insights.openNow} />
              </dl>
            </section>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card title={t.insights.dailyTitle} className="lg:col-span-2">
                <DailyChart data={data.daily} locale={locale} />
              </Card>
              <Card title={t.insights.winRate}>
                <WinRate won={data.totals.won} lost={data.totals.lost} />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title={t.insights.stagesTitle}>
                {data.stages.every((stage) => stage.count === 0) ? (
                  <p className="text-sm text-muted">{t.insights.stagesNone}</p>
                ) : (
                  <BarList
                    rows={data.stages.map((stage) => ({
                      key: stage.id,
                      name: new Set(data.stages.map((item) => item.pipeline)).size > 1 ? `${stage.pipeline} › ${stage.name}` : stage.name,
                      count: stage.count,
                      detail: stage.totalMinor > 0 ? money(stage.totalMinor) : undefined,
                    }))}
                  />
                )}
              </Card>
              <Card title={t.insights.lossTitle}>
                {data.lossReasons.length === 0 ? (
                  <p className="text-sm text-muted">{t.insights.lossNone}</p>
                ) : (
                  <BarList rows={data.lossReasons.map((reason) => ({ key: reason.id ?? "none", name: reason.name ?? t.insights.lossUnknown, count: reason.count }))} />
                )}
              </Card>
            </div>

            <Card title={t.insights.usersTitle} body={t.insights.usersBody}>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-xl border-collapse text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b">
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t.insights.colUser}
                      </th>
                      {[t.insights.created, t.insights.won, t.insights.lost, t.insights.winRate, t.insights.colWonAmount].map((label) => (
                        <th key={label} scope="col" className="px-3 py-1 text-right font-medium">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => {
                      const closed = user.won + user.lost;
                      return (
                        <tr key={user.id ?? "none"} className="border-b last:border-b-0">
                          <th scope="row" className="max-w-56 truncate py-2 pr-3 font-medium text-fg">
                            {user.name ?? <span className="font-normal text-muted">{t.insights.noOwner}</span>}
                          </th>
                          <td className="px-3 py-2 text-right text-fg tabular-nums">{user.created}</td>
                          <td className="px-3 py-2 text-right text-fg tabular-nums">{user.won}</td>
                          <td className="px-3 py-2 text-right text-fg tabular-nums">{user.lost}</td>
                          <td className="px-3 py-2 text-right text-fg tabular-nums">{closed > 0 ? `%${Math.round((user.won / closed) * 100)}` : t.common.none}</td>
                          <td className="px-3 py-2 text-right text-fg tabular-nums">{user.wonMinor > 0 ? money(user.wonMinor) : t.common.none}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title={t.insights.eventsTitle}>
              {data.events.length === 0 ? (
                <p className="text-sm text-muted">{t.insights.eventsNone}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {data.events.map((event) => (
                    <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                      <span className="min-w-0 text-sm text-fg">
                        <Link href={`/w/${ws}/leads/${event.leadId}`} className="rounded-sm font-semibold text-accent underline-offset-2 hover:underline">
                          {event.leadName}
                        </Link>
                        <span className="text-muted"> · {eventText(event, t)}</span>
                      </span>
                      <time dateTime={event.createdAt} className="shrink-0 text-xs text-muted">
                        {formatAgo(event.createdAt, now, t.time)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
