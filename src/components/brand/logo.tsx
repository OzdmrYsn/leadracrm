import { cn } from "@/components/ui/cn";
import { tr } from "@/i18n/tr";

/**
 * Geçici işaret: üst üste oturan üç basamak ("aşamaları kendiniz kurarsınız"). Logo özeti replica/brand.md içinde;
 * asıl logo geldiğinde yalnız bu dosya değişir.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7 shrink-0", className)} fill="currentColor">
      <rect x="3" y="21" width="26" height="8" rx="2.5" />
      <rect x="10" y="12" width="19" height="7" rx="2.5" opacity="0.72" />
      <rect x="17" y="3" width="12" height="7" rx="2.5" opacity="0.46" />
    </svg>
  );
}

/** İşaret ve ürün adı. Renk bulunduğu yerden gelir (currentColor). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-lg font-bold", className)}>
      <LogoMark />
      {tr.app.name}
    </span>
  );
}
