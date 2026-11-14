"use client";

import type { ComponentProps } from "react";
import { Select as S } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";

export type SelectOption = {
  value: string;
  label: string;
  /** Aşama rengi gibi bir token değişkeni, örn. "--stage-1". */
  swatch?: string;
  disabled?: boolean;
};

type SelectProps = ComponentProps<typeof S.Root> & {
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function Select({
  options,
  placeholder,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectProps) {
  // Seçili seçeneğin rengi (ör. aşama) kapalı kutuda da görünür.
  const swatch = options.find((option) => option.value === props.value)?.swatch;
  return (
    <S.Root {...props}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border-input bg-bg px-3 text-sm text-fg transition-colors hover:border-fg disabled:cursor-not-allowed disabled:border-border disabled:bg-surface disabled:text-muted aria-invalid:border-danger data-placeholder:text-muted",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {swatch ? <span aria-hidden className="size-3 shrink-0 rounded-pill border border-border-input" style={{ background: `var(${swatch})` }} /> : null}
          <span className="truncate">
            <S.Value placeholder={placeholder} />
          </span>
        </span>
        <S.Icon>
          <ChevronDown aria-hidden className="size-4 text-muted" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border bg-bg shadow-pop"
        >
          <S.Viewport className="p-1">
            {options.map((option) => (
              <S.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex h-8 cursor-default items-center gap-2 rounded-sm pr-8 pl-2 text-sm text-fg outline-none select-none data-disabled:text-muted data-highlighted:bg-surface-strong"
              >
                {option.swatch ? (
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-pill border border-border-input"
                    style={{ background: `var(${option.swatch})` }}
                  />
                ) : null}
                <S.ItemText>{option.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2">
                  <Check aria-hidden className="size-4" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
