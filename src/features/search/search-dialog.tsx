"use client";

import { useEffect, useId, useState, type KeyboardEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Building2, ListChecks, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { fill, useI18n } from "@/i18n";
import { useDebounced, useSearch } from "@/lib/hooks";

type Kind = "leads" | "contacts" | "companies";
type Hit = { id: string; name: string; detail: string | null; href: string };

const ICONS: Record<Kind, LucideIcon> = { leads: ListChecks, contacts: Users, companies: Building2 };
const KINDS: Kind[] = ["leads", "contacts", "companies"];

function SearchBody({ ws, onDone }: { ws: string; onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const settled = useDebounced(query, 200).trim();
  const results = useSearch(ws, settled);
  const ready = settled.length >= 2 && results.data !== undefined;
  // Yazı durulmadan ya da yeni sonuç gelmeden görünen liste bir önceki sorgunundur.
  const stale = query.trim() !== settled || results.isPlaceholderData;

  const groups = ready
    ? KINDS.map((kind) => ({ kind, hits: results.data[kind].map((hit): Hit => ({ ...hit, href: `/w/${ws}/${kind}/${hit.id}` })) })).filter((group) => group.hits.length > 0)
    : [];
  const flat = groups.flatMap((group) => group.hits);
  // Her grubun ilk sonucunun düz listedeki sırası.
  const offsets = groups.map((_, at) => groups.slice(0, at).reduce((sum, group) => sum + group.hits.length, 0));
  const current = Math.min(active, flat.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;
  const activeId = flat.length > 0 ? optionId(current) : undefined;

  // Ok tuşlarıyla gezerken seçili sonuç görünür kalsın.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function go(hit: Hit) {
    onDone();
    router.push(hit.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current - 1 + flat.length) % flat.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(flat.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Eski sorgunun sonucunu açma: hızlı yazıp Enter'a basan kullanıcı yanlış kayda gitmesin.
      if (!stale) go(flat[current]);
    }
  }

  const status =
    settled.length < 2
      ? t.search.hint
      : results.isError
        ? t.common.loadFailed
        : !ready
          ? t.common.loading
          : flat.length === 0
            ? fill(t.search.noMatch, { query: settled })
            : fill(t.search.count, { count: flat.length });

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`${id}-input`} className="sr-only">
        {t.search.label}
      </label>
      <Input
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={flat.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        // Pencere açılınca odak doğrudan arama kutusuna gelir (ilk odaklanabilir öğe kapat düğmesi olurdu).
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={t.search.placeholder}
        maxLength={120}
      />
      <p role="status" aria-live="polite" className={cn("text-sm text-muted", flat.length > 0 && "sr-only")}>
        {status}
      </p>
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label={t.search.results}
        aria-busy={stale || undefined}
        className={cn("flex flex-col gap-3 transition-opacity", flat.length === 0 && "hidden", stale && "opacity-60")}
      >
        {groups.map((group, groupAt) => {
          const Icon = ICONS[group.kind];
          return (
            <div key={group.kind} role="group" aria-labelledby={`${id}-${group.kind}`} className="flex flex-col gap-1">
              <p id={`${id}-${group.kind}`} className="text-xs font-medium text-muted">
                {t.search.groups[group.kind]}
              </p>
              {group.hits.map((hit, hitAt) => {
                const position = offsets[groupAt] + hitAt;
                const selected = position === current;
                return (
                  // Klavye girdi alanından yönetilir (aria-activedescendant); satırın kendisi yalnız fareyle tıklanır.
                  <div
                    key={hit.id}
                    id={optionId(position)}
                    role="option"
                    aria-selected={selected}
                    onClick={() => go(hit)}
                    onMouseMove={() => setActive(position)}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-md px-2 py-2", selected ? "bg-accent-soft" : "hover:bg-surface")}
                  >
                    <Icon aria-hidden className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{hit.name}</span>
                      {hit.detail ? <span className="block truncate text-xs text-muted">{hit.detail}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Genel arama: lead, kişi ve şirketlerde arar; ↑ ↓ ile gezilir, Enter kaydı açar. */
export function SearchDialog({
  ws,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={t.search.title} closeLabel={t.common.close} open={open} onOpenChange={onOpenChange} returnFocusTo={returnFocusTo}>
      <SearchBody ws={ws} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
