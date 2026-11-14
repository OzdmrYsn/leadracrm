import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Clock3 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/components/ui/cn";
import { PLANNED_SOURCES, READY_SOURCES, type SourceDef } from "@/features/sources/catalog";
import { SourceGlyph } from "@/features/sources/source-glyph";
import { fill } from "@/i18n/fill";
import { tr } from "@/i18n/tr";
import { PlayBoard } from "./play-board";
import sourcesShot from "../../../public/landing/kaynaklar.png";
import boardShot from "../../../public/landing/pano.png";
import insightsShot from "../../../public/landing/raporlar.png";

const t = tr.landing;
const name = tr.app.name;

/** Koyu zemindeki birincil çağrı: sarı düğme. Açık zeminde petrol düğme kullanılır. */
const cta = "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md px-6 text-base font-semibold whitespace-nowrap transition-colors";
const ctaHighlight = cn(cta, "bg-highlight text-on-highlight hover:bg-highlight-hover");
const ctaAccent = cn(cta, "bg-accent text-on-accent hover:bg-accent-hover");

/** Ürün ekran görüntüsü: pencere çerçevesi içinde. */
function Shot({ src, alt, eager = false, className }: { src: StaticImageData; alt: string; eager?: boolean; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-bg shadow-lift", className)}>
      <div aria-hidden className="flex h-8 items-center gap-1.5 border-b bg-surface px-3">
        <span className="size-2.5 rounded-pill bg-stage-strong-6" />
        <span className="size-2.5 rounded-pill bg-stage-strong-2" />
        <span className="size-2.5 rounded-pill bg-stage-strong-4" />
      </div>
      <Image
        src={src}
        alt={alt}
        sizes="(min-width: 1280px) 1120px, 100vw"
        placeholder="blur"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        className="block h-auto w-full"
      />
    </div>
  );
}

function SourceChip({ source, planned = false }: { source: SourceDef; planned?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-ink-raised py-2 pr-4 pl-2">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md text-on-accent [&_svg]:size-4" style={{ backgroundColor: source.tint }}>
        <SourceGlyph source={source} />
      </span>
      <span className={cn("text-sm font-medium", planned ? "text-on-ink-muted" : "text-on-ink")}>{tr.sources.items[source.id].name}</span>
    </li>
  );
}

export function LandingPage() {
  const anchors = [
    { href: "#nasil", label: t.nav.how },
    { href: "#ozellikler", label: t.nav.features },
    { href: "#kaynaklar", label: t.nav.sources },
    { href: "#sorular", label: t.nav.faq },
  ];

  return (
    <div className="bg-bg text-fg">
      <a href="#icerik" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-bg focus:px-3 focus:py-2 focus:text-sm focus:text-fg focus:shadow-pop">
        {tr.common.skipToContent}
      </a>

      {/* Başlık ve kahraman bölümü aynı koyu zemini paylaşır. */}
      <div data-surface="dark" className="bg-ink text-on-ink">
        <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <Link href="/" aria-label={fill(tr.auth.home, { name })} className="rounded-sm text-on-ink">
            <Logo />
          </Link>
          <nav aria-label={t.nav.label} className="hidden items-center gap-1 lg:flex">
            {anchors.map((item) => (
              <a key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm font-medium text-on-ink-muted transition-colors hover:bg-ink-raised hover:text-on-ink">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-on-ink transition-colors hover:bg-ink-raised">
              {t.login}
            </Link>
            <Link href="/signup" className="hidden h-10 items-center rounded-md bg-highlight px-4 text-sm font-semibold text-on-highlight transition-colors hover:bg-highlight-hover sm:inline-flex">
              {t.signup}
            </Link>
          </div>
        </header>

        <section id="icerik" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-10 md:px-8 md:pt-16">
          <h1 className="max-w-3xl font-display text-display text-balance text-on-ink md:text-hero">
            {t.hero.titleParts[0]} <span className="rounded-lg bg-highlight box-decoration-clone px-2 text-on-highlight">{t.hero.titleParts[1]}</span> {t.hero.titleParts[2]}
          </h1>
          <p className="max-w-2xl text-base text-pretty text-on-ink-muted md:text-lg md:font-normal">{fill(t.hero.body, { name })}</p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link href="/signup" className={ctaHighlight}>
              {t.signup}
              <ArrowRight aria-hidden className="size-5" />
            </Link>
            <a href="#nasil" className={cn(cta, "border border-sidebar-border text-on-ink hover:bg-ink-raised")}>
              {t.hero.secondary}
            </a>
          </div>
          <p className="text-sm text-on-ink-muted">{t.hero.note}</p>
        </section>

        {/* Ziyaretçinin kendi eliyle oynadığı pano: ürünün ana fikri burada denenir. */}
        <section aria-label={t.play.label} className="mx-auto mt-10 w-full max-w-6xl px-4 pb-12 md:mt-14 md:px-8 md:pb-20">
          <div className="motion-settle rounded-xl bg-ink-raised p-4 md:p-6">
            <PlayBoard />
          </div>
        </section>
      </div>

      <main>
        <section aria-labelledby="sorun" className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <h2 id="sorun" className="font-display text-xl text-balance text-fg md:text-2xl">
            {t.problem.title}
          </h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
            {t.problem.items.map((item) => (
              <div key={item.title} className="flex flex-col gap-2 border-t-2 border-fg pt-4">
                <h3 className="text-lg text-fg">{item.title}</h3>
                <p className="text-base text-pretty text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="nasil" aria-labelledby="nasil-baslik" className="scroll-mt-4 bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <h2 id="nasil-baslik" className="max-w-xl font-display text-xl text-balance text-fg md:text-2xl">
              {t.how.title}
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {t.how.steps.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-3 rounded-xl bg-bg p-6 shadow-card">
                  <span aria-hidden className="font-display text-display text-accent">
                    {index + 1}
                  </span>
                  <h3 className="text-lg text-fg">{step.title}</h3>
                  <p className="text-base text-pretty text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="ozellikler" aria-labelledby="ozellikler-baslik" className="mx-auto w-full max-w-6xl scroll-mt-4 px-4 py-16 md:px-8 md:py-24">
          <h2 id="ozellikler-baslik" className="max-w-xl font-display text-xl text-balance text-fg md:text-2xl">
            {t.features.title}
          </h2>
          <div className="mt-12 flex flex-col gap-16 md:gap-24">
            {t.features.rows.map((row, index) => (
              <div key={row.title} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
                <div className={cn("flex flex-col gap-4 lg:col-span-4", index % 2 === 1 && "lg:order-2")}>
                  <h3 className="font-display text-xl text-balance text-fg">{row.title}</h3>
                  <p className="text-base text-pretty text-muted">{row.body}</p>
                  <ul className="flex flex-col gap-2 pt-1">
                    {row.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-fg">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <Shot src={[boardShot, sourcesShot, insightsShot][index]} alt={row.alt} eager={index === 0} className="lg:col-span-8" />
              </div>
            ))}
          </div>
          <div className="mt-16 grid gap-x-10 gap-y-8 border-t pt-10 md:mt-24 md:grid-cols-3">
            {t.features.extras.map((item) => (
              <div key={item.title} className="flex flex-col gap-2">
                <h3 className="text-lg text-fg">{item.title}</h3>
                <p className="text-base text-pretty text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="kaynaklar" aria-labelledby="kaynaklar-baslik" data-surface="dark" className="scroll-mt-4 bg-ink text-on-ink">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12">
            <div className="flex flex-col gap-3 lg:col-span-4">
              <h2 id="kaynaklar-baslik" className="font-display text-xl text-balance text-on-ink md:text-2xl">
                {t.sources.title}
              </h2>
              <p className="text-base text-pretty text-on-ink-muted">{t.sources.body}</p>
            </div>
            <div className="flex flex-col gap-8 lg:col-span-8">
              <div className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-highlight">
                  <Check aria-hidden className="size-4" strokeWidth={2.5} />
                  {t.sources.ready}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {READY_SOURCES.map((source) => (
                    <SourceChip key={source.id} source={source} />
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-on-ink-muted">
                  <Clock3 aria-hidden className="size-4" />
                  {t.sources.planned}
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {PLANNED_SOURCES.map((source) => (
                    <SourceChip key={source.id} source={source} planned />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="sorular" aria-labelledby="sorular-baslik" className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 py-16 md:px-8 md:py-24">
          <h2 id="sorular-baslik" className="font-display text-xl text-balance text-fg md:text-2xl">
            {t.faq.title}
          </h2>
          <div className="mt-8 flex flex-col divide-y border-y">
            {t.faq.items.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium text-fg [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform duration-(--motion-base) group-open:rotate-180" />
                </summary>
                <p className="max-w-[65ch] pb-5 text-base text-pretty text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="son-baslik" className="px-4 pb-16 md:px-8 md:pb-24">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 rounded-xl bg-accent-soft px-6 py-10 md:flex-row md:items-center md:justify-between md:px-12 md:py-14">
            <div className="flex max-w-xl flex-col gap-2">
              <h2 id="son-baslik" className="font-display text-xl text-balance text-fg md:text-2xl">
                {t.final.title}
              </h2>
              <p className="text-base text-pretty text-fg">{t.final.body}</p>
            </div>
            <Link href="/signup" className={ctaAccent}>
              {t.signup}
              <ArrowRight aria-hidden className="size-5" />
            </Link>
          </div>
        </section>
      </main>

      <footer data-surface="dark" className="bg-ink text-on-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex flex-col gap-2">
            <Logo />
            <p className="text-sm text-on-ink-muted">{tr.app.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href="/login" className="rounded-sm text-on-ink underline-offset-4 hover:underline">
              {t.login}
            </Link>
            <Link href="/signup" className="rounded-sm text-on-ink underline-offset-4 hover:underline">
              {t.signup}
            </Link>
            <span className="text-on-ink-muted">{fill(t.footer.rights, { year: 2026, name })}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
