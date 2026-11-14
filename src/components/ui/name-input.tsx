"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Input } from "./field";

/** Yerinde düzenlenen ad alanı: odaktan çıkınca ya da Enter ile kaydeder, Esc eski değere döner. */
export function NameInput({
  value,
  label,
  disabled,
  onSave,
  className = "h-8 min-w-0 flex-1",
}: {
  value: string;
  label: string;
  disabled?: boolean;
  /** Kaydı başlatır. Söz reddedilirse aynı metin yeniden denenebilir. */
  onSave: (next: string) => Promise<unknown>;
  /** Satır içinde esner; tek başına duruyorsa tam genişlik verin. */
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Enter'ın ardından gelen odak kaybı aynı metni ikinci kez kaydetmesin.
  const pending = useRef<string | null>(null);

  function commit() {
    const next = draft.trim();
    if (next === "") {
      setDraft(value);
      return;
    }
    if (next === value || next === pending.current) return;
    pending.current = next;
    onSave(next).then(
      () => undefined,
      () => {
        pending.current = null;
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      // Pencerenin kapanmasını önler; yalnız bu alandaki değişikliği geri alır.
      event.stopPropagation();
      setDraft(value);
    }
  }

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-label={label}
      disabled={disabled}
      maxLength={100}
      className={className}
    />
  );
}
