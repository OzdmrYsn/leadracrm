"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Building2, Cable, CalendarClock, ChartColumn, ChevronsUpDown, Kanban, ListChecks, LogOut, MessageSquare, Search, Settings, Sun, UserRound, Users, Zap, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/feedback";
import { Menu } from "@/components/ui/overlay";
import { CountBadge } from "@/components/ui/tag";
import { SearchDialog } from "@/features/search/search-dialog";
import { fill, useI18n } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { daysLeft, type Subscription } from "@/lib/billing";
import { errorText } from "@/lib/errors";
import { useConversations, useNow, useResendVerification, useSession } from "@/lib/hooks";

type NavItem = { key: string; label: string; href: string; icon: LucideIcon; badge?: number };

/** Uygulama kabuğu: solda ana menü, sağda ekran. Dar ekranda menü yalnız simge gösterir. */
export function Shell({ ws, children }: { ws: string; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const session = useSession(ws);
  const conversations = useConversations(ws, "open", "");
  const unread = (conversations.data ?? []).reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const root = `/w/${ws}`;
  const [searching, setSearching] = useState(false);
  const searchButton = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  async function logout() {
    const result = await api.post<{ redirect: string }>("/api/auth/logout");
    window.location.assign(result.redirect);
  }

  // Ctrl+K (Mac'te ⌘K da) aramayı her ekrandan açar.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Üç öbek: günlük iş, kurulum ve ölçüm, ayarlar. Öbekler ince bir çizgiyle ayrılır.
  const groups: NavItem[][] = [
    [
      { key: "home", label: t.nav.home, href: `${root}/home`, icon: Sun },
      { key: "pipelines", label: t.nav.pipelines, href: `${root}/pipelines`, icon: Kanban },
      { key: "leads", label: t.nav.leads, href: `${root}/leads`, icon: ListChecks },
      { key: "inbox", label: t.nav.inbox, href: `${root}/inbox`, icon: MessageSquare, badge: unread },
      { key: "calendar", label: t.nav.calendar, href: `${root}/calendar`, icon: CalendarClock },
      { key: "contacts", label: t.nav.contacts, href: `${root}/contacts`, icon: Users },
      { key: "companies", label: t.nav.companies, href: `${root}/companies`, icon: Building2 },
    ],
    [
      { key: "sources", label: t.nav.sources, href: `${root}/sources`, icon: Cable },
      { key: "automations", label: t.nav.automations, href: `${root}/automations`, icon: Zap },
      { key: "insights", label: t.nav.insights, href: `${root}/insights`, icon: ChartColumn },
    ],
    [{ key: "settings", label: t.nav.settings, href: `${root}/settings`, icon: Settings }],
  ];

  // Oturum yoksa (süresi dolmuş, başka yerden kapatılmış) giriş sayfasına gidilir.
  const signedOut = session.error instanceof ApiError && session.error.status === 401;
  useEffect(() => {
    if (signedOut) router.replace("/login");
  }, [signedOut, router]);
  if (signedOut) return null;

  if (session.error instanceof ApiError && session.error.status === 404) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        {/* Çalışma alanı yoksa ya da oturumdaki kullanıcı artık üyesi değilse: çıkış yolu giriş sayfasıdır. */}
        <EmptyState
          title={t.common.notFound}
          action={
            <Link href="/login" className={buttonClass({ variant: "secondary" })}>
              {t.auth.backToLogin}
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-bg focus:px-3 focus:py-2 focus:text-sm focus:text-fg focus:shadow-pop"
      >
        {t.common.skipToContent}
      </a>
      <aside className="flex w-(--layout-sidebar-collapsed) shrink-0 flex-col border-r bg-bg md:w-(--layout-sidebar)">
        <div className="flex h-(--layout-header) shrink-0 items-center justify-center gap-2 px-3 md:justify-start md:px-5">
          <LogoMark className="text-accent" />
          <span className="hidden font-display text-lg font-bold text-fg md:inline">{t.app.name}</span>
        </div>
        <div className="px-2 pb-1 md:px-3">
          <button
            ref={searchButton}
            type="button"
            onClick={() => setSearching(true)}
            title={t.search.open}
            aria-keyshortcuts="Control+K Meta+K"
            className="flex h-10 w-full items-center justify-center gap-3 rounded-md border bg-surface px-2 text-sm text-muted transition-colors hover:border-border-input hover:text-fg md:justify-start md:px-3"
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="sr-only md:not-sr-only md:flex-1 md:text-left">{t.search.open}</span>
            <kbd aria-hidden className="hidden rounded-sm border bg-bg px-1.5 font-sans text-xs md:inline">
              Ctrl K
            </kbd>
          </button>
        </div>
        <nav aria-label={t.nav.label} className="flex-1 overflow-y-auto px-2 py-2 md:px-3">
          <ul className="flex flex-col gap-0.5">
            {groups.map((group, index) =>
              group.map((item, position) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.key} className={cn(index > 0 && position === 0 && "mt-2 border-t pt-2")}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                      className={cn(
                        "relative flex h-11 items-center justify-center gap-3 rounded-md px-2 text-base transition-colors md:justify-start md:px-3",
                        active ? "bg-accent-soft font-semibold text-accent" : "text-fg hover:bg-surface",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-5 shrink-0", active ? "text-accent" : "text-muted")} />
                      <span className="sr-only md:not-sr-only md:flex-1 md:truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="absolute top-1 right-1 md:static">
                          <CountBadge count={item.badge} label={fill(t.nav.unread, { count: item.badge })} />
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              }),
            )}
          </ul>
        </nav>
        <div className="border-t p-2 md:p-3">
          {session.data ? (
            <Menu
              align="start"
              trigger={
                <button type="button" className="flex h-12 w-full items-center justify-center gap-3 rounded-md px-1 text-left transition-colors hover:bg-surface md:justify-start md:px-2">
                  <Avatar name={session.data.user.name} locale={session.data.workspace.locale} decorative />
                  <span className="sr-only">{fill(t.auth.accountMenu, { name: session.data.user.name })}</span>
                  <span aria-hidden className="hidden min-w-0 flex-1 flex-col md:flex">
                    <span className="truncate text-sm font-medium text-fg">{session.data.user.name}</span>
                    <span className="truncate text-xs text-muted">{session.data.workspace.name}</span>
                  </span>
                  <ChevronsUpDown aria-hidden className="hidden size-4 shrink-0 text-muted md:block" />
                </button>
              }
              items={[
                { label: t.auth.profile, icon: <UserRound aria-hidden />, onSelect: () => router.push(`${root}/settings/profile`) },
                { kind: "separator" },
                { label: t.auth.logout, icon: <LogOut aria-hidden />, onSelect: () => void logout() },
              ]}
            />
          ) : (
            <span aria-hidden className="mx-auto block size-8 rounded-pill bg-surface-strong md:mx-2" />
          )}
        </div>
      </aside>
      <div id="main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface outline-none">
        {session.data && !session.data.emailVerified ? <VerifyBanner /> : null}
        {session.data ? <SubscriptionBanner ws={ws} subscription={session.data.subscription} isAdmin={session.data.user.isAdmin} /> : null}
        {children}
      </div>
      <SearchDialog ws={ws} open={searching} onOpenChange={setSearching} returnFocusTo={searchButton} />
    </div>
  );
}

/** E-posta doğrulanmamışsa her ekranın üstünde durur; doğrulama iletisi buradan yeniden istenir. */
function VerifyBanner() {
  const { t } = useI18n();
  const resend = useResendVerification();
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-warning-soft px-4 py-2 text-sm text-fg md:px-5">
      <span>{resend.isSuccess ? t.auth.verifySent : resend.isError ? errorText(resend.error, t) : t.auth.unverified}</span>
      {resend.isSuccess ? null : (
        <button type="button" disabled={resend.isPending} onClick={() => resend.mutate()} className="rounded-sm font-semibold text-fg underline underline-offset-2 disabled:opacity-60">
          {t.auth.resendVerify}
        </button>
      )}
    </div>
  );
}

/**
 * Abonelik uyarısı: deneme bitmek üzereyken, ödeme alınamadığında ve çalışma alanı salt okunur olduğunda
 * her ekranın üstünde durur. Yönetici abonelik ekranına gider; üyeye yöneticisine haber vermesi söylenir.
 */
function SubscriptionBanner({ ws, subscription, isAdmin }: { ws: string; subscription: Subscription; isAdmin: boolean }) {
  const { t } = useI18n();
  const b = t.billing.banner;
  const now = useNow(60_000);
  const days = daysLeft(subscription.trialEndsAt, now);
  const kind = subscription.readOnly ? "readOnly" : subscription.state === "past_due" ? "pastDue" : subscription.state === "trialing" && days <= 5 ? "trial" : null;
  if (!kind) return null;
  const text = kind === "readOnly" ? b.readOnly : kind === "pastDue" ? b.pastDue : days <= 1 ? b.trialLastDay : fill(b.trial, { days });
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm text-fg md:px-5",
        kind === "readOnly" ? "bg-danger-soft" : kind === "pastDue" ? "bg-warning-soft" : "bg-info-soft",
      )}
    >
      <span>{text}</span>
      {isAdmin ? (
        <Link href={`/w/${ws}/settings/billing`} className="rounded-sm font-semibold text-fg underline underline-offset-2">
          {kind === "trial" || kind === "readOnly" ? b.subscribe : b.manage}
        </Link>
      ) : (
        <span>{b.askAdmin}</span>
      )}
    </div>
  );
}

/** Ekran başlığı: solda başlık, sağda eylemler. before başlığın önünde, after hemen ardında durur. */
export function ScreenHeader({
  title,
  before,
  after,
  children,
}: {
  title: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  children?: ReactNode;
}) {
  // Bölüm ekranlarında başlık büyük harfli ve aralıklıdır; kayıt ekranlarında (geri düğmesi olanlar) kaydın adı olduğu gibi yazılır.
  const record = Boolean(before);
  return (
    <header className="flex min-h-(--layout-header) shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-bg px-4 py-2 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {before}
        <h1 className={cn("truncate text-fg", record ? "text-lg" : "text-base font-bold tracking-wide uppercase")}>{title}</h1>
        {after}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}
