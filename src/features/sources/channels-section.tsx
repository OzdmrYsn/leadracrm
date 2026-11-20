"use client";

import { useId, useState, type FormEvent, type RefObject } from "react";
import { Check, FlaskConical, TriangleAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog, DialogClose } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/tag";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { formatAgo } from "@/lib/format";
import { useConnectChannel, useDisconnectChannel } from "@/lib/hooks";
import type { Channel, ChannelKind, Pipeline } from "@/lib/types";
import { CHANNEL_SOURCES, type SourceDef } from "./catalog";
import { SourceGlyph } from "./source-glyph";

/** Yerel taklitle çalışırken doldurulan deneme belirteci: biçimi gerçek belirteçle aynıdır, gerçek bir bota ait değildir. */
const DEV_TELEGRAM_TOKEN = "100200300:DENEME-yerel-taklit-belirteci-0001";

function Mark({ source }: { source: SourceDef }) {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md text-on-accent [&_svg]:size-4" style={{ backgroundColor: source.tint }}>
      <SourceGlyph source={source} />
    </span>
  );
}

/** Bağlı kanalların satırları: ad, tür, sağlık durumu ve bağlantıyı kesme düğmesi. Üst bileşenin listesinin içine konur. */
export function ChannelRows({ channels, canEdit, now, onDisconnect }: { channels: Channel[]; canEdit: boolean; now: number; onDisconnect: (channel: Channel, trigger: HTMLElement) => void }) {
  const { t } = useI18n();
  const c = t.channels;
  return (
    <>
      {channels.map((channel) => {
        const source = CHANNEL_SOURCES[channel.kind];
        const broken = channel.status === "error";
        return (
          <li key={channel.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
            {source ? <Mark source={source} /> : null}
            <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                <span className="break-words">{channel.name}</span>
                <Badge>{t.chat.channel[channel.kind]}</Badge>
                <Badge tone={broken ? "danger" : "success"}>{broken ? c.statusError : c.statusConnected}</Badge>
              </p>
              <p className="text-xs text-muted">{channel.lastEventAt ? fill(c.lastEvent, { time: formatAgo(channel.lastEventAt, now, t.time) }) : c.never}</p>
              {broken ? <p className="text-xs break-words text-danger">{(c.errorReasons as Record<string, string>)[channel.lastError ?? ""] ?? c.errorUnknown}</p> : null}
            </div>
            {canEdit ? (
              <Button variant="ghost" size="sm" icon={<Unplug aria-hidden />} aria-label={fill(c.disconnectLabel, { name: channel.name })} onClick={(event) => onDisconnect(channel, event.currentTarget)}>
                {c.disconnect}
              </Button>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

/**
 * Bağlantıyı kesme onayı. Liste boşalınca satırlar ekrandan kalkar; bu pencere listenin dışında durur ki
 * işlem bitince sonucu söyleyebilsin.
 */
export function ChannelDisconnectDialog({
  ws,
  target,
  onClose,
  onDone,
  returnFocusTo,
}: {
  ws: string;
  /** null: pencere kapalı. */
  target: Channel | null;
  onClose: () => void;
  onDone: (text: string) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const c = t.channels;
  const disconnect = useDisconnectChannel(ws);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <Dialog
      title={c.disconnectTitle}
      description={target ? fill(c.disconnectBody, { name: target.name }) : ""}
      closeLabel={t.common.close}
      open={target !== null}
      onOpenChange={(next) => {
        if (next) return;
        setProblem(null);
        onClose();
      }}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">{t.common.cancel}</Button>
          </DialogClose>
          <Button
            variant="danger"
            loading={disconnect.isPending}
            onClick={() => {
              if (!target) return;
              setProblem(null);
              disconnect.mutate(target.id, {
                onSuccess: () => {
                  onDone(fill(c.disconnected, { name: target.name }));
                  onClose();
                },
                onError: (error) => setProblem(errorText(error, t)),
              });
            }}
          >
            {c.disconnectConfirm}
          </Button>
        </>
      }
    >
      {problem ? (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      ) : null}
    </Dialog>
  );
}

function TelegramForm({ ws, sandbox, pipelines, onDone }: { ws: string; sandbox: boolean; pipelines: Pipeline[]; onDone: () => void }) {
  const { t } = useI18n();
  const c = t.channels;
  const id = useId();
  const connect = useConnectChannel(ws);
  const main = pipelines.find((item) => item.isMain) ?? pipelines[0];
  const [token, setToken] = useState("");
  const [pipelineId, setPipelineId] = useState(main?.id ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Channel | null>(null);

  const tokenError = submitted && token.trim() === "" ? c.telegram.tokenRequired : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setProblem(null);
    if (token.trim() === "") return;
    connect.mutate(
      { kind: "telegram", token: token.trim(), pipelineId: pipelines.length > 1 ? pipelineId : undefined },
      { onSuccess: setDone, onError: (error) => setProblem(errorText(error, t)) },
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success" icon={<Check aria-hidden />}>
          {fill(c.done, { name: done.name })}
        </Notice>
        <div className="flex justify-end">
          <Button variant="primary" onClick={onDone}>
            {t.intakes.done}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {sandbox ? (
        <Notice tone="warning" icon={<FlaskConical aria-hidden />}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {c.telegram.devNotice}
            <button type="button" onClick={() => setToken(DEV_TELEGRAM_TOKEN)} className="rounded-sm font-semibold text-accent underline underline-offset-2">
              {c.telegram.devFill}
            </button>
          </span>
        </Notice>
      ) : null}
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-fg">
        {c.telegram.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Field id={`${id}-token`} label={c.telegram.token} hint={c.telegram.tokenHint} error={tokenError} required>
        <Input
          id={`${id}-token`}
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={tokenError ? true : undefined}
          aria-describedby={`${id}-token-note`}
        />
      </Field>
      {pipelines.length > 1 ? (
        <Field id={`${id}-pipeline`} label={c.pipeline}>
          <Select id={`${id}-pipeline`} value={pipelineId} onValueChange={setPipelineId} options={pipelines.map((item) => ({ value: item.id, label: item.name }))} />
        </Field>
      ) : null}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">{t.common.cancel}</Button>
        </DialogClose>
        <Button type="submit" variant="primary" loading={connect.isPending}>
          {c.telegram.submit}
        </Button>
      </div>
    </form>
  );
}

/** Kanal bağlama penceresi. Her kanal türünün kendi formu vardır; anahtar yalnız bu istekte gider. */
export function ChannelConnectDialog({
  ws,
  kind,
  sandbox,
  pipelines,
  onClose,
  returnFocusTo,
}: {
  ws: string;
  /** null: pencere kapalı. */
  kind: ChannelKind | null;
  sandbox: boolean;
  pipelines: Pipeline[];
  onClose: () => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const name = kind ? t.chat.channel[kind] : "";
  return (
    <Dialog
      title={fill(t.channels.dialogTitle, { name })}
      description={kind === "telegram" ? t.channels.telegram.intro : ""}
      closeLabel={t.common.close}
      open={kind !== null}
      onOpenChange={(next) => (next ? undefined : onClose())}
      returnFocusTo={returnFocusTo}
    >
      {kind === "telegram" ? <TelegramForm ws={ws} sandbox={sandbox} pipelines={pipelines} onDone={onClose} /> : null}
    </Dialog>
  );
}
