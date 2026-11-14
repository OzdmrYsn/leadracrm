"use client";

import { useState, type DragEvent } from "react";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { Confetti } from "@/components/ui/confetti";
import { cn } from "@/components/ui/cn";
import { fill } from "@/i18n/fill";
import { tr } from "@/i18n/tr";

type Card = { id: number; name: string; who: string; price: number; stage: number };

// Örnek kartlar: gerçek kişi ya da işletme değildir.
const START: Card[] = [
  { id: 1, name: "Gömme dolap, üç oda", who: "Okan T.", price: 41500, stage: 0 },
  { id: 2, name: "Vestiyer", who: "Ece K.", price: 18000, stage: 0 },
  { id: 3, name: "Mutfak yenileme", who: "Deniz A.", price: 64000, stage: 1 },
  { id: 4, name: "Ofis masaları", who: "Mert D.", price: 32000, stage: 1 },
  { id: 5, name: "Toplantı odası", who: "Selin A.", price: 185000, stage: 2 },
];
const COLORS = [1, 2, 3, 4] as const;
const LAST = COLORS.length - 1;

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

/**
 * Tanıtım sayfasındaki dokunulabilir pano: ziyaretçi aşama adlarını değiştirir, kartları ilerletir ya da sürükler.
 * Veri yalnız tarayıcıda durur; hiçbir yere gönderilmez. Son sütuna varan kart kutlanır.
 */
export function PlayBoard() {
  const t = tr.landing.play;
  const [names, setNames] = useState<string[]>([...t.stages]);
  const [cards, setCards] = useState<Card[]>(START);
  const [burst, setBurst] = useState(0);
  const [over, setOver] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  function move(id: number, stage: number) {
    const card = cards.find((item) => item.id === id);
    if (!card || card.stage === stage) return;
    setCards(cards.map((item) => (item.id === id ? { ...item, stage } : item)));
    setStatus(fill(tr.board.moved, { name: card.name, stage: names[stage] || fill(t.stageName, { n: stage + 1 }) }));
    if (stage === LAST) setBurst((current) => current + 1);
  }

  function reset() {
    setNames([...t.stages]);
    setCards(START);
    setStatus("");
  }

  function drop(event: DragEvent, stage: number) {
    event.preventDefault();
    setOver(null);
    const id = Number(event.dataTransfer.getData("text/plain"));
    if (id) move(id, stage);
  }

  const changed = cards !== START || names.some((name, index) => name !== t.stages[index]);

  return (
    <div className="flex flex-col gap-4">
      <Confetti burst={burst} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-on-ink">
          <span aria-hidden className="rounded-md bg-highlight px-2 py-0.5 text-xs font-bold text-on-highlight">
            {t.badge}
          </span>
          {t.hint}
        </p>
        <button
          type="button"
          onClick={reset}
          disabled={!changed}
          className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-on-ink-muted transition-colors hover:bg-ink hover:text-on-ink disabled:opacity-40"
        >
          <RotateCcw aria-hidden className="size-4" />
          {t.reset}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <ol className="grid min-w-[52rem] grid-cols-4 items-start gap-3 md:min-w-0">
          {COLORS.map((color, stage) => {
            const list = cards.filter((card) => card.stage === stage);
            const total = list.reduce((sum, card) => sum + card.price, 0);
            return (
              <li
                key={color}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(stage);
                }}
                onDragLeave={() => setOver((current) => (current === stage ? null : current))}
                onDrop={(event) => drop(event, stage)}
                className={cn("flex min-w-0 flex-col gap-2.5 rounded-xl p-1.5 transition-colors", over === stage && "bg-ink ring-2 ring-highlight")}
              >
                <div data-surface="light" className="flex flex-col gap-2 rounded-xl px-3.5 py-3 text-ink shadow-block" style={{ background: `var(--stage-bright-${color})` }}>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={names[stage]}
                      onChange={(event) => setNames(names.map((name, index) => (index === stage ? event.target.value : name)))}
                      maxLength={24}
                      aria-label={fill(t.stageName, { n: stage + 1 })}
                      className="w-full min-w-0 rounded-sm bg-transparent text-sm font-bold text-ink underline decoration-dashed decoration-1 underline-offset-4 outline-offset-4"
                    />
                    <span className="shrink-0 rounded-pill bg-ink px-2 py-0.5 text-xs text-on-ink">{fill(tr.board.leadCount, { count: list.length })}</span>
                  </div>
                  <p className="font-display text-lg text-ink tabular-nums">{money.format(total)}</p>
                </div>
                {list.map((card) => (
                  <article
                    key={card.id}
                    data-surface="light"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", String(card.id));
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    className="motion-block flex cursor-grab flex-col gap-2 rounded-xl bg-bg p-3.5 text-fg shadow-card active:cursor-grabbing"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-fg">{card.name}</h3>
                      <p className="truncate text-xs text-muted">{card.who}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-base font-bold text-fg tabular-nums">{money.format(card.price)}</span>
                      {stage < LAST ? (
                        <button
                          type="button"
                          onClick={() => move(card.id, stage + 1)}
                          aria-label={fill(t.advanceLabel, { name: card.name })}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-ink px-2.5 text-xs font-semibold text-on-ink transition-colors hover:bg-ink-raised"
                        >
                          {t.advance}
                          <ArrowRight aria-hidden className="size-3.5" />
                        </button>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-1 rounded-md bg-success-soft px-2.5 text-xs font-semibold text-success">
                          <Check aria-hidden className="size-3.5" />
                          {t.won}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
                {list.length === 0 ? <p className="rounded-xl border border-dashed border-on-ink-muted px-3 py-5 text-center text-xs text-on-ink-muted">{t.empty}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
