"use client";

import { RadioGroup as R } from "radix-ui";
import { cn } from "./cn";

export type AccessLevel = "none" | "own" | "group" | "all";

const LEVELS: AccessLevel[] = ["none", "own", "group", "all"];

const checkedTone: Record<AccessLevel, string> = {
  none: "data-[state=checked]:bg-danger-soft data-[state=checked]:text-danger",
  own: "data-[state=checked]:bg-warning-soft data-[state=checked]:text-warning",
  group: "data-[state=checked]:bg-info-soft data-[state=checked]:text-info",
  all: "data-[state=checked]:bg-success-soft data-[state=checked]:text-success",
};

/**
 * Yetki matrisinin bir hücresi: yok / sorumlu olduğu / grubu / tümü.
 * Düzey her zaman metinle yazar; renk yalnız destekler. Ok tuşlarıyla değişir.
 */
export function AccessLevelControl({
  value,
  onValueChange,
  label,
  labels,
  disabled,
}: {
  value: AccessLevel;
  onValueChange: (value: AccessLevel) => void;
  /** Hücrenin adı, örn. "Lead'ler: görüntüleme". */
  label: string;
  labels: Record<AccessLevel, string>;
  disabled?: boolean;
}) {
  return (
    <R.Root
      value={value}
      onValueChange={(next) => onValueChange(next as AccessLevel)}
      aria-label={label}
      orientation="horizontal"
      disabled={disabled}
      className="inline-flex rounded-md border border-border-input bg-bg p-0.5"
    >
      {LEVELS.map((level) => (
        <R.Item
          key={level}
          value={level}
          className={cn(
            "h-7 rounded-sm px-2 text-xs text-muted transition-colors hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:font-semibold",
            checkedTone[level],
          )}
        >
          {labels[level]}
        </R.Item>
      ))}
    </R.Root>
  );
}
