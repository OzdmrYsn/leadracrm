"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { SendHorizontal, StickyNote, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/feedback";
import { useI18n } from "@/i18n";

type Mode = "chat" | "note";

/** Sunucudaki sınırlarla aynı; kutu daha uzununu yazdırmaz. */
const MAX_LENGTH: Record<Mode, number> = { chat: 4096, note: 10_000 };

/**
 * Yazma kutusu. Sohbet mesajı ya da ekip içi not gönderir.
 * onSend ya da onNote başarıyla dönerse kutu boşalır; hata olursa metin yerinde kalır.
 */
export function Composer({
  onSend,
  onNote,
  pending = false,
}: {
  /** Verilmezse sohbet kapalıdır (lead'e bağlı konuşma yok). */
  onSend?: (body: string) => Promise<unknown>;
  /** Verilmezse not kapalıdır (gelen kutusu). */
  onNote?: (body: string) => Promise<unknown>;
  pending?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [mode, setMode] = useState<Mode>(onSend ? "chat" : "note");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active: Mode = mode === "chat" && !onSend ? "note" : mode === "note" && !onNote ? "chat" : mode;
  const canSubmit = text.trim().length > 0 && !busy && !pending;

  async function submit() {
    if (!canSubmit) return;
    const body = text.trim();
    const action = active === "chat" ? onSend : onNote;
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await action(body);
      setText("");
    } catch {
      setError(active === "chat" ? t.chat.sendFailed : t.chat.noteFailed);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t bg-bg p-3">
      {error ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {error}
        </Notice>
      ) : null}
      {onSend && onNote ? (
        <div role="group" aria-label={t.chat.modeLabel} className="flex gap-1">
          {(["chat", "note"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={active === option}
              onClick={() => setMode(option)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                active === option ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-surface-strong hover:text-fg",
              )}
            >
              {option === "chat" ? t.chat.modeChat : t.chat.modeNote}
            </button>
          ))}
        </div>
      ) : null}
      {!onSend ? <p className="text-xs text-muted">{t.chat.noConversation}</p> : null}
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">
          {active === "chat" ? t.chat.composerLabel : t.chat.notePlaceholder}
        </label>
        <textarea
          id={id}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_LENGTH[active]}
          aria-describedby={`${id}-hint`}
          placeholder={active === "chat" ? t.chat.messagePlaceholder : t.chat.notePlaceholder}
          className={cn(
            "max-h-40 min-h-10 flex-1 resize-none rounded-md border border-border-input px-3 py-2 text-sm text-fg transition-colors placeholder:text-muted hover:border-fg",
            active === "note" ? "bg-warning-soft" : "bg-bg",
          )}
        />
        <Button
          variant="primary"
          iconOnly
          loading={busy}
          disabled={!canSubmit}
          onClick={() => void submit()}
          aria-label={active === "chat" ? t.chat.send : t.chat.addNote}
        >
          {busy ? null : active === "chat" ? <SendHorizontal aria-hidden /> : <StickyNote aria-hidden />}
        </Button>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted">
        {t.chat.sendHint}
      </p>
    </div>
  );
}
