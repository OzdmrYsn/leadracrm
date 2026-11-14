import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover",
  secondary: "border border-border-input bg-bg text-fg hover:bg-surface active:bg-surface-strong",
  ghost: "bg-transparent text-fg hover:bg-surface-strong active:bg-surface-strong",
  danger: "bg-danger text-on-danger hover:brightness-90 active:brightness-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

const iconOnlySizes: Record<Size, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Yüklenirken etiket yerinde kalır; düğme tıklanamaz ve ekran okuyucuya meşgul bildirilir. */
  loading?: boolean;
  icon?: ReactNode;
  /** Yalnız simge gösterir. aria-label zorunludur. */
  iconOnly?: boolean;
};

/** Düğme görünümlü bağlantılar (<Link>, <a>) için aynı sınıflar. */
export function buttonClass({ variant = "secondary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconOnly = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], iconOnly ? iconOnlySizes[size] : sizes[size], className)}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Aç/kapat düğmesi: hızlı süzgeç ve görünüm seçimi gibi iki durumlu seçimler. Durum aria-pressed ile bildirilir. */
export function ToggleButton({ pressed, className, type = "button", ...props }: ComponentProps<"button"> & { pressed: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "h-8 shrink-0 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
        pressed ? "bg-ink text-on-ink" : "text-muted hover:bg-surface-strong hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
