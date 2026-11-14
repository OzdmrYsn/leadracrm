"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Building2, Cable, CalendarClock, ChartColumn, ChevronsUpDown, Kanban, ListChecks, LogOut, MessageSquare, Search, Settings, Sun, UserRound, Users, Zap, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/feedback";
import { Menu } from "@/components/ui/overlay";
import { CountBadge } from "@/components/ui/tag";
import { SearchDialog } from "@/features/search/search-dialog";
import { fill, useI18n } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { useConversations, useSession } from "@/lib/hooks";

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

  const items: NavItem[] = [
    { key: "home", label: t.nav.home, href: `${root}/home`, icon: Sun },
    { key: "pipelines", label: t.nav.pipelines, href: `${root}/pipelines`, icon: Kanban },
    { key: "leads", label: t.nav.leads, href: `${root}/leads`, icon: ListChecks },
    { key: "inbox", label: t.nav.inbox, href: `${root}/inbox`, icon: MessageSquare, badge: unread },
    { key: "calendar", label: t.nav.calendar, href: `${root}/calendar`, icon: CalendarClock },
    { key: "contacts", label: t.nav.contacts, href: `${root}/contacts`, icon: Users },
    { key: "companies", label: t.nav.companies, href: `${root}/companies`, icon: Building2 },
    { key: "sources", label: t.nav.sources, href: `${root}/sources`, icon: Cable },
    { key: "automations", label: t.nav.automations, href: `${root}/automations`, icon: Zap },
    { key: "insights", label: t.nav.insights, href: `${root}/insights`, icon: ChartColumn },
    { key: "settings", label: t.nav.settings, href: `${root}/settings`, icon: Settings },
  ];

  if (session.error instanceof ApiError && session.error.status === 404) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <EmptyState title={t.common.notFound} />
      </main>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-bg focus:px-3 focus:py-2 focus:text-sm focus:text-fg focus:shadow-pop"
      >
        {t.common.skipToContent}
      </a>
      <aside data-surface="dark" className="flex w-(--layout-sidebar-collapsed) shrink-0 flex-col bg-sidebar text-on-sidebar md:w-(--layout-sidebar)">
        <div className="flex h-(--layout-header) items-center justify-center gap-2 px-3 md:justify-start">
          {session.data ? (
            <>
              <Avatar name={session.data.workspace.name} locale={session.data.workspace.locale} decorative />
              <span className="hidden truncate text-sm font-semibold text-on-sidebar md:inline">{session.data.workspace.name}</span>
            </>
          ) : (
            <span aria-hidden className="size-8 rounded-pill bg-sidebar-raised" />
          )}
        </div>
        <div className="px-2 pt-2">
          <button
            ref={searchButton}
            type="button"
            onClick={() => setSearching(true)}
            title={t.search.open}
            aria-keyshortcuts="Control+K Meta+K"
            className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-sidebar-border bg-sidebar-raised px-2 text-sm text-on-sidebar-muted transition-colors hover:border-on-sidebar-muted hover:text-on-sidebar md:justify-start md:px-3"
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="sr-only md:not-sr-only md:flex-1 md:text-left">{t.search.open}</span>
            <kbd aria-hidden className="hidden font-sans text-xs md:inline">
              Ctrl K
            </kbd>
          </button>
        </div>
        <nav aria-label={t.nav.label} className="flex-1 overflow-y-auto px-2 py-2">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    className={cn(
                      "relative flex h-10 items-center justify-center gap-3 rounded-md px-2 text-sm font-medium transition-colors md:justify-start md:px-3",
                      active ? "bg-sidebar-active text-on-sidebar" : "text-on-sidebar-muted hover:bg-sidebar-raised hover:text-on-sidebar",
                    )}
                  >
                    <Icon aria-hidden className={cn("size-4 shrink-0", active && "text-highlight")} />
                    <span className="sr-only md:not-sr-only md:flex-1 md:truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="absolute top-1 right-1 md:static">
                        <CountBadge count={item.badge} label={fill(t.nav.unread, { count: item.badge })} />
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-sidebar-border p-2">
          {session.data ? (
            <Menu
              align="start"
              trigger={
                <button type="button" className="flex h-10 w-full items-center justify-center gap-2 rounded-md px-1 text-left transition-colors hover:bg-sidebar-raised md:justify-start">
                  <Avatar name={session.data.user.name} locale={session.data.workspace.locale} decorative />
                  <span className="sr-only">{fill(t.auth.accountMenu, { name: session.data.user.name })}</span>
                  <span aria-hidden className="hidden min-w-0 flex-1 truncate text-sm text-on-sidebar md:inline">
                    {session.data.user.name}
                  </span>
                  <ChevronsUpDown aria-hidden className="hidden size-4 shrink-0 text-on-sidebar-muted md:block" />
                </button>
              }
              items={[
                { label: t.auth.profile, icon: <UserRound aria-hidden />, onSelect: () => router.push(`${root}/settings/profile`) },
                { kind: "separator" },
                { label: t.auth.logout, icon: <LogOut aria-hidden />, onSelect: () => void logout() },
              ]}
            />
          ) : (
            <span aria-hidden className="mx-auto block size-8 rounded-pill bg-sidebar-raised md:mx-1" />
          )}
        </div>
      </aside>
      <div id="main" tabIndex={-1} className="my-1.5 mr-1.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface outline-none md:my-2 md:mr-2">
        {children}
      </div>
      <SearchDialog ws={ws} open={searching} onOpenChange={setSearching} returnFocusTo={searchButton} />
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
  return (
    <header className="flex min-h-(--layout-header) shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-bg px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {before}
        <h1 className="truncate font-display text-lg text-fg">{title}</h1>
        {after}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}
