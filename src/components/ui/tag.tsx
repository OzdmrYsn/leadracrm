import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export type StageColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-strong text-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** Durum rozeti. Anlam yalnız renkle verilmez; metin her zaman vardır. */
export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-pill px-2 text-xs [&_svg]:size-3", tones[tone])}>
      {icon}
      {children}
    </span>
  );
}

type TagProps = {
  children: ReactNode;
  /** Aşama paletinden renk. Verilmezse nötr. */
  color?: StageColor;
  onRemove?: () => void;
  /** Kaldır düğmesinin erişilebilir adı, örn. "VIP etiketini kaldır". onRemove varsa zorunlu. */
  removeLabel?: string;
};

/** Etiket çipi. */
export function Tag({ children, color, onRemove, removeLabel }: TagProps) {
  return (
    <span
      className="inline-flex h-6 max-w-full items-center gap-1 rounded-sm pl-2 text-xs text-fg"
      style={{ background: color ? `var(--stage-${color})` : "var(--surface-strong)" }}
    >
      {color ? <span aria-hidden className="size-1.5 shrink-0 rounded-pill" style={{ background: `var(--stage-strong-${color})` }} /> : null}
      <span className={cn("truncate", !onRemove && "pr-2")}>{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-fg hover:bg-overlay hover:text-bg"
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/** Okunmamış sayacı. 99 üstü "99+" gösterilir. label ekran okuyucu içindir, örn. "3 okunmamış mesaj". */
export function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-danger px-1 text-xs text-on-danger">
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
