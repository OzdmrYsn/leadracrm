"use client";

import type { ComponentProps } from "react";
import { Checkbox as C, Switch as W } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "./cn";

/**
 * Onay kutusu. Etiketle birlikte kullanın; tıklama alanı etiketle büyür.
 * large: görünür etiketi olmayan yerlerde (tablo satırı seçimi) kutunun kendisi 24 piksel olur.
 */
export function Checkbox({ className, large = false, ...props }: ComponentProps<typeof C.Root> & { large?: boolean }) {
  return (
    <C.Root
      className={cn(
        // Görünen kutu 20 piksel; before ile tıklama alanı 24 piksele çıkar.
        "relative flex shrink-0 items-center justify-center rounded-sm border border-border-input bg-bg text-on-accent transition-colors before:absolute before:-inset-0.5 hover:border-fg disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
        large ? "size-6" : "size-5",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        {props.checked === "indeterminate" ? (
          <Minus aria-hidden className="size-4" strokeWidth={3} />
        ) : (
          <Check aria-hidden className="size-4" strokeWidth={3} />
        )}
      </C.Indicator>
    </C.Root>
  );
}

/** Aç/kapat anahtarı. Anında etkili ayarlar için; form gönderimi bekleyen seçimlerde onay kutusu kullanın. */
export function Switch({ className, ...props }: ComponentProps<typeof W.Root>) {
  return (
    <W.Root
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-pill bg-border-input transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <W.Thumb className="block size-5 translate-x-0.5 rounded-pill bg-bg shadow-card transition-transform data-[state=checked]:translate-x-4.5" />
    </W.Root>
  );
}
