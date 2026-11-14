import type { SourceDef } from "./catalog";

/**
 * Kaynağın simgesi: tanınan bir markaysa onun tek renk işareti, değilse genel bir simge.
 * Renk bulunduğu yerden gelir (currentColor). Süs amaçlıdır; kaynağın adı her zaman yanında yazar.
 */
export function SourceGlyph({ source, className, strokeWidth }: { source: SourceDef; className?: string; strokeWidth?: number }) {
  if (source.brand) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
        <path d={source.brand.path} />
      </svg>
    );
  }
  const Icon = source.icon;
  return <Icon aria-hidden className={className} strokeWidth={strokeWidth} />;
}
