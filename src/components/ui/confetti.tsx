"use client";

import { useMemo, type CSSProperties } from "react";

const PIECES = 44;

/** Tohumdan türeyen sayı dizisi: aynı patlama her çizimde aynı görünür (rastgelelik çizim sırasında üretilmez). */
function series(seed: number) {
  let state = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * Kutlama: renkli küçük bloklar yukarıdan saçılıp düşer. `burst` her arttığında yeniden oynar; 0 iken çizilmez.
 * Tamamen süstür: ekran okuyucudan gizlidir ve hareket azaltma tercihinde hiç görünmez.
 */
export function Confetti({ burst }: { burst: number }) {
  const pieces = useMemo(() => {
    const next = series(burst);
    return Array.from({ length: PIECES }, (_, index) => ({
      index,
      left: 8 + next() * 84,
      size: 8 + Math.round(next() * 8),
      color: 1 + Math.floor(next() * 7),
      drift: Math.round((next() - 0.5) * 320),
      turn: Math.round((next() - 0.5) * 1080),
      delay: Math.round(next() * 260),
      duration: 1400 + Math.round(next() * 900),
    }));
  }, [burst]);
  if (burst === 0) return null;
  return (
    <div key={burst} aria-hidden className="confetti pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <span
          key={piece.index}
          className="confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              width: piece.size,
              height: Math.round(piece.size * 0.62),
              background: `var(--stage-bright-${piece.color})`,
              animationDelay: `${piece.delay}ms`,
              animationDuration: `${piece.duration}ms`,
              "--drift": `${piece.drift}px`,
              "--turn": `${piece.turn}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
