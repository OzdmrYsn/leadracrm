"use client";

import type { ReactNode, RefObject } from "react";
import { Dialog as D, DropdownMenu as M, Popover as O, Tabs as T, Tooltip as P } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "./cn";

/* ---------- İpucu ---------- */

/** Simge düğmelerinin adını gösterir. Tek bilgi kaynağı olamaz; düğmenin aria-label'ı ayrıca verilir. */
export function Tooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <P.Provider delayDuration={300}>
      <P.Root>
        <P.Trigger asChild>{children}</P.Trigger>
        <P.Portal>
          <P.Content side={side} sideOffset={6} className="z-50 rounded-sm bg-fg px-2 py-1 text-xs text-bg shadow-pop">
            {label}
          </P.Content>
        </P.Portal>
      </P.Root>
    </P.Provider>
  );
}

/* ---------- Kalıcı pencere ---------- */

type DialogProps = {
  title: string;
  description?: string;
  /** Kapat düğmesinin erişilebilir adı. */
  closeLabel: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  footer?: ReactNode;
  /** trigger verilmeden açılan pencerelerde, kapanınca odağın döneceği öğe. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/** Odak pencerede tutulur, Esc kapatır, kapanınca odak tetikleyiciye döner. */
export function Dialog({ title, description, closeLabel, trigger, open, onOpenChange, footer, returnFocusTo, children }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <D.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(event) => {
            if (returnFocusTo?.current) {
              event.preventDefault();
              returnFocusTo.current.focus();
            }
          }}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-bg shadow-modal"
        >
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <div className="min-w-0">
              <D.Title className="text-lg text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : null}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="sm" iconOnly aria-label={closeLabel}>
                <X aria-hidden />
              </Button>
            </D.Close>
          </div>
          <div className="overflow-y-auto px-6 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t px-6 py-4">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const DialogClose = D.Close;

/* ---------- Açılır panel ---------- */

/**
 * Tetikleyicinin yanında açılan küçük panel: seçici, süzgeç, küçük form.
 * Odak panele girer, Esc kapatır, kapanınca odak tetikleyiciye döner. label panelin okunur adıdır.
 */
export function Popover({
  trigger,
  label,
  align = "start",
  open,
  onOpenChange,
  className,
  children,
}: {
  trigger: ReactNode;
  label: string;
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <O.Root open={open} onOpenChange={onOpenChange}>
      <O.Trigger asChild>{trigger}</O.Trigger>
      <O.Portal>
        <O.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          aria-label={label}
          className={cn("z-50 flex max-h-(--radix-popover-content-available-height) w-72 flex-col gap-3 overflow-y-auto rounded-md border bg-bg p-3 shadow-pop", className)}
        >
          {children}
        </O.Content>
      </O.Portal>
    </O.Root>
  );
}

export const PopoverClose = O.Close;

/* ---------- Açılır menü ---------- */

export type MenuItem =
  | { kind?: "item"; label: string; icon?: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean }
  | { kind: "separator" };

/** Ok tuşlarıyla gezilir, yazınca öğeye atlar, Esc kapatır. */
export function Menu({
  trigger,
  items,
  align = "end",
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "center" | "end";
}) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content align={align} sideOffset={4} className="z-50 min-w-48 rounded-md border bg-bg p-1 shadow-pop">
          {items.map((item, index) =>
            item.kind === "separator" ? (
              <M.Separator key={index} className="my-1 h-px bg-border" />
            ) : (
              <M.Item
                key={index}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none data-disabled:text-muted data-highlighted:bg-surface-strong [&_svg]:size-4",
                  item.danger ? "text-danger" : "text-fg",
                )}
              >
                {item.icon}
                {item.label}
              </M.Item>
            ),
          )}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

/* ---------- Sekmeler ---------- */

export type TabItem = { value: string; label: string; content: ReactNode };

/** Sol/sağ ok sekmeler arasında gezer; içerik paneli sekmeye bağlıdır. */
export function Tabs({ tabs, defaultValue, label }: { tabs: TabItem[]; defaultValue?: string; label: string }) {
  return (
    <T.Root defaultValue={defaultValue ?? tabs[0]?.value}>
      <T.List aria-label={label} className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <T.Trigger
            key={tab.value}
            value={tab.value}
            className="-mb-px h-10 border-b-2 border-transparent px-3 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg"
          >
            {tab.label}
          </T.Trigger>
        ))}
      </T.List>
      {tabs.map((tab) => (
        <T.Content key={tab.value} value={tab.value} className="pt-4">
          {tab.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
