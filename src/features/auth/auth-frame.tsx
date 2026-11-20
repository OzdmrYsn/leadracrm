import type { ReactNode } from "react";
import Link from "next/link";
import { Check, FlaskConical } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { MiniBoard } from "@/components/brand/mini-board";
import { fill } from "@/i18n/fill";
import { tr } from "@/i18n/tr";

/**
 * Kayıt, giriş ve şifre sayfalarının çerçevesi: geniş ekranda solda açık marka paneli, sağda form.
 * devMode geliştirme sağlayıcısının sınırını söyleyen notu gösterir.
 */
export function AuthFrame({ title, body, devMode, children, footer }: { title: string; body: string; devMode: boolean; children: ReactNode; footer?: ReactNode }) {
  const t = tr.auth;
  const home = fill(t.home, { name: tr.app.name });
  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col gap-10 overflow-hidden border-r bg-surface p-10 text-fg lg:flex xl:p-14">
        <Link href="/" aria-label={home} className="w-fit rounded-sm text-fg">
          <Logo />
        </Link>
        <div className="flex max-w-md flex-col gap-6">
          <p className="font-display text-2xl text-balance text-fg">{t.panelTitle}</p>
          <ul className="flex flex-col gap-3">
            {t.panelPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-base text-fg">
                <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill bg-accent text-on-accent">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <MiniBoard className="mt-auto w-full" />
      </aside>

      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/" aria-label={home} className="w-fit rounded-sm text-fg lg:hidden">
            <Logo />
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-xl text-balance text-fg">{title}</h1>
            <p className="text-base text-pretty text-muted">{body}</p>
          </div>
          {devMode ? (
            <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-fg">
              <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              {t.devNotice}
            </p>
          ) : null}
          {children}
          {footer ? <div className="text-sm text-muted">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}

/** Formların altındaki "… mı? Bağlantı" satırı. */
export function AuthSwitch({ question, href, label }: { question?: string; href: string; label: string }) {
  return (
    <p>
      {question ? `${question} ` : null}
      <Link href={href} className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover">
        {label}
      </Link>
    </p>
  );
}
