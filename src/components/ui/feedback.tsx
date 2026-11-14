import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

/** Kısa beklemeler için. label görünür metindir ve ekran okuyucuya da okunur. */
export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      {label}
    </span>
  );
}

/** İçerik yüklenirken yer tutucu. Yüklenen bölgeye aria-busy verin; iskeletin kendisi gizlidir. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-strong", className)} />;
}

/** Boş durum: ne olmadığını ve sıradaki adımı söyler. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon ? (
        <span aria-hidden className="flex size-14 items-center justify-center rounded-pill bg-accent-soft text-accent [&_svg]:size-6">
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-fg">{title}</p>
        {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

type NoticeTone = "info" | "success" | "warning" | "danger";

const noticeTones: Record<NoticeTone, string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/** Sayfa içi bildirim. Hata için role="alert", diğerleri için role="status". */
export function Notice({ tone = "info", icon, children }: { tone?: NoticeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", noticeTones[tone])}
    >
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
