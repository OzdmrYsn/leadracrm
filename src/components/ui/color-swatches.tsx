"use client";

import { RadioGroup as R } from "radix-ui";
import { Ban, Check } from "lucide-react";
import type { StageColor } from "./tag";

const COLORS: StageColor[] = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Palet seçici: aşama ve etiket renkleri için sekiz renk, istenirse "renksiz".
 * Her rengin okunur bir adı vardır; seçili olan onay işaretiyle de gösterilir. Ok tuşlarıyla gezilir.
 */
export function ColorSwatches({
  value,
  onValueChange,
  label,
  names,
  noneLabel,
}: {
  value: StageColor | null;
  onValueChange: (value: StageColor | null) => void;
  label: string;
  names: Record<StageColor, string>;
  /** Verilirse "renksiz" seçeneği de gösterilir. */
  noneLabel?: string;
}) {
  return (
    <R.Root
      value={value === null ? "none" : String(value)}
      onValueChange={(next) => onValueChange(next === "none" ? null : (Number(next) as StageColor))}
      aria-label={label}
      orientation="horizontal"
      className="flex flex-wrap gap-2"
    >
      {noneLabel ? (
        <R.Item
          value="none"
          aria-label={noneLabel}
          title={noneLabel}
          className="flex size-6 items-center justify-center rounded-pill border border-border-input bg-bg text-muted data-[state=checked]:text-fg"
        >
          <Ban aria-hidden className="size-4" />
        </R.Item>
      ) : null}
      {COLORS.map((color) => (
        <R.Item
          key={color}
          value={String(color)}
          aria-label={names[color]}
          title={names[color]}
          className="flex size-6 items-center justify-center rounded-pill border border-border-input text-fg"
          style={{ background: `var(--stage-${color})` }}
        >
          <R.Indicator>
            <Check aria-hidden className="size-4" strokeWidth={3} />
          </R.Indicator>
        </R.Item>
      ))}
    </R.Root>
  );
}
