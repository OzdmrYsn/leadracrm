import { cn } from "@/components/ui/cn";

type Card = { name: string; who: string; price: string; tag?: string };
type Column = { name: string; color: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; total: string; cards: Card[] };

// Süs amaçlı küçük pano. Gerçek kişi ya da veri içermez; ekran okuyucudan gizlidir.
const COLUMNS: Column[] = [
  { name: "İlk temas", color: 1, total: "₺41.500", cards: [{ name: "Gömme dolap, üç oda", who: "Okan T.", price: "₺41.500", tag: "Yeniden arama" }] },
  {
    name: "Görüşme",
    color: 2,
    total: "₺96.000",
    cards: [
      { name: "Mutfak yenileme", who: "Deniz A.", price: "₺64.000", tag: "VIP" },
      { name: "Ofis masaları", who: "Mert D.", price: "₺32.000" },
    ],
  },
  { name: "Teklif", color: 3, total: "₺185.000", cards: [{ name: "Toplantı odası", who: "Selin A.", price: "₺185.000", tag: "Acil" }] },
];

/** Tanıtım ve giriş sayfalarındaki pano görseli: gerçek ekranın küçük bir benzeri, HTML ile çizilir. */
export function MiniBoard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("grid grid-cols-3 gap-3 rounded-lg border bg-surface p-3 text-fg shadow-lift select-none", className)}>
      {COLUMNS.map((column) => (
        <div key={column.name} className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-col items-center gap-0.5 border-b-2 pb-2" style={{ borderColor: `var(--stage-strong-${column.color})` }}>
            <p className="max-w-full truncate text-xs font-bold tracking-wide text-fg uppercase">{column.name}</p>
            <p className="text-xs text-muted">{column.total}</p>
          </div>
          {column.cards.map((card) => (
            <div key={card.name} className="flex flex-col gap-1 rounded-md border bg-bg p-2.5">
              <p className="truncate text-xs text-muted">{card.who}</p>
              <p className="truncate text-xs font-semibold text-accent">{card.name}</p>
              {card.tag ? (
                <span className="w-fit rounded-sm px-1.5 py-0.5 text-xs text-fg" style={{ backgroundColor: `var(--stage-${column.color})` }}>
                  {card.tag}
                </span>
              ) : null}
              <p className="text-xs font-semibold text-fg">{card.price}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
