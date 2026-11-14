import { cn } from "./cn";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "size-6 text-xs",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
};

/** Baş harfleri verir. Yerel ayar önemlidir: Türkçede "i" → "İ". */
export function initials(name: string, locale?: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase(locale);
}

// Her ada hep aynı zemin rengi düşer; liste ve panoda kişiler renkten de ayırt edilir.
const tints = ["bg-stage-1", "bg-stage-2", "bg-stage-3", "bg-stage-4", "bg-stage-5", "bg-stage-6", "bg-stage-7"];

function tintOf(name: string): string {
  let sum = 0;
  for (const char of name) sum = (sum * 31 + (char.codePointAt(0) ?? 0)) % 9973;
  return tints[sum % tints.length];
}

/** Baş harfli avatar. Ad zaten yanında yazıyorsa decorative verin; yalnız başına duruyorsa ad okunur. */
export function Avatar({
  name,
  size = "md",
  locale,
  decorative = false,
  className,
}: {
  name: string;
  size?: Size;
  locale?: string;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-semibold text-fg select-none",
        tintOf(name),
        sizes[size],
        className,
      )}
    >
      {initials(name, locale) || "?"}
    </span>
  );
}
