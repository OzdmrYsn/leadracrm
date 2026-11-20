import type { ReactNode } from "react";
import Link from "next/link";
import { Check, CheckCheck, CircleAlert, Clock, TriangleAlert } from "lucide-react";
import { Avatar } from "./avatar";
import { cn } from "./cn";
import { CountBadge, Tag, type StageColor } from "./tag";

/* ---------- Pano: aşama sütunu başlığı ---------- */

export function StageHeader({
  name,
  color,
  countLabel,
  total,
}: {
  name: string;
  color: StageColor;
  /** Örn. "12 lead". */
  countLabel: string;
  /** Örn. "₺184.500". */
  total?: string;
}) {
  // Aşamanın kimliği başlığın altındaki ince renkli çizgidir; ad büyük harfle, sayı ve tutar altında durur.
  return (
    <header className="flex flex-col items-center gap-0.5 border-b-2 px-2 pb-2.5 text-center" style={{ borderColor: `var(--stage-strong-${color})` }}>
      <h3 className="max-w-full truncate text-sm font-bold tracking-wide text-fg uppercase">{name}</h3>
      <p className="flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5 text-xs text-muted tabular-nums">
        <span>{countLabel}</span>
        {total ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-semibold text-fg">{total}</span>
          </>
        ) : null}
      </p>
    </header>
  );
}

/* ---------- Pano: lead kartı ---------- */

export type LeadCardProps = {
  name: string;
  contact?: string;
  /** Karttaki avatarın baş harfleri bu addan gelir (kişi adı). Verilmezse lead adı kullanılır. */
  avatarName?: string;
  price?: string;
  lastMessage?: string;
  time?: string;
  tags?: Array<{ label: string; color?: StageColor }>;
  unread?: number;
  /** Örn. "2 okunmamış mesaj". unread varsa zorunlu. */
  unreadLabel?: string;
  /** Planlı görev yoksa gösterilecek uyarı, örn. "Görev yok". */
  noTaskLabel?: string;
  owner?: string;
  locale?: string;
  dragging?: boolean;
  /** Verilirse ad bağlantı olur ve kartın tamamı tıklanabilir. */
  href?: string;
  /** Sağ üst köşe: kart menüsü gibi eylemler. */
  actions?: ReactNode;
};

export function LeadCard({
  name,
  contact,
  avatarName,
  price,
  lastMessage,
  time,
  tags,
  unread = 0,
  unreadLabel = "",
  noTaskLabel,
  owner,
  locale,
  dragging = false,
  href,
  actions,
}: LeadCardProps) {
  // Yoğun, düz kart: solda kişi, üstte kimden ve ne zaman, altında vurgu renginde lead adı, en altta tutar ve durum.
  return (
    <article
      className={cn(
        "relative flex gap-2.5 rounded-md border bg-bg p-3 transition-[box-shadow,border-color] hover:border-border-input hover:shadow-card",
        dragging && "rotate-2 border-accent shadow-pop",
      )}
    >
      <Avatar name={avatarName || name} locale={locale} decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <div className={cn("flex items-baseline justify-between gap-2", actions ? "pr-7" : null)}>
            <p className="min-w-0 truncate text-xs text-muted">{contact}</p>
            <span className="shrink-0 text-xs text-muted">{time}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <h4 className="min-w-0 text-sm font-semibold break-words text-accent">
              {href ? (
                // after: bağlantının tıklama alanını kartın tamamına yayar.
                <Link href={href} draggable={false} className="rounded-sm underline-offset-2 after:absolute after:inset-0 after:rounded-md hover:underline">
                  {name}
                </Link>
              ) : (
                name
              )}
            </h4>
            <CountBadge count={unread} label={unreadLabel} />
          </div>
        </div>
        {lastMessage ? <p className="line-clamp-2 text-sm text-muted">{lastMessage}</p> : null}
        {tags?.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Tag key={tag.label} color={tag.color}>
                {tag.label}
              </Tag>
            ))}
          </div>
        ) : null}
        {price || noTaskLabel || owner ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-fg tabular-nums">{price}</span>
            <span className="flex items-center gap-2 text-xs">
              {noTaskLabel ? (
                <span className="inline-flex items-center gap-1 font-medium text-warning">
                  <TriangleAlert aria-hidden className="size-3" />
                  {noTaskLabel}
                </span>
              ) : null}
              {owner ? <Avatar name={owner} size="sm" locale={locale} /> : null}
            </span>
          </div>
        ) : null}
      </div>
      {actions ? <div className="absolute top-1.5 right-1.5 z-10">{actions}</div> : null}
    </article>
  );
}

/* ---------- Gelen kutusu: konuşma satırı ---------- */

export function ConversationItem({
  name,
  channel,
  preview,
  time,
  unread = 0,
  unreadLabel = "",
  selected = false,
  locale,
  onClick,
}: {
  name: string;
  channel: string;
  preview: string;
  time: string;
  unread?: number;
  unreadLabel?: string;
  selected?: boolean;
  locale?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
        selected ? "bg-accent-soft" : "bg-bg hover:bg-surface",
      )}
    >
      <Avatar name={name} locale={locale} decorative />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-fg">{name}</span>
          <span className="shrink-0 text-xs text-muted">{time}</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm", unread > 0 ? "font-medium text-fg" : "text-muted")}>{preview}</span>
          <CountBadge count={unread} label={unreadLabel} />
        </span>
        <span className="text-xs text-muted">{channel}</span>
      </span>
    </button>
  );
}

/* ---------- Yazışma: mesaj balonu ---------- */

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

function StatusIcon({ status, label }: { status: MessageStatus; label: string }) {
  const icon: Record<MessageStatus, ReactNode> = {
    queued: <Clock aria-hidden className="size-3" />,
    sent: <Check aria-hidden className="size-3" />,
    delivered: <CheckCheck aria-hidden className="size-3" />,
    read: <CheckCheck aria-hidden className="size-3 text-info" />,
    failed: <CircleAlert aria-hidden className="size-3 text-danger" />,
  };
  return (
    <span className="inline-flex items-center">
      {icon[status]}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function MessageBubble({
  direction,
  time,
  status,
  statusLabel = "",
  author,
  failure,
  action,
  children,
}: {
  direction: "in" | "out";
  time: string;
  /** Yalnız giden mesajlarda. */
  status?: MessageStatus;
  /** Durumun okunur adı, örn. "Okundu". status varsa zorunlu. */
  statusLabel?: string;
  /** Mesajı yazan: giden mesajda kullanıcı ya da bot (görünür), gelen mesajda müşteri (yalnız ekran okuyucuya). */
  author?: string;
  /** Gönderilemediyse neden, örn. "kişi botu engellemiş". */
  failure?: string;
  /** Gönderilemeyen mesajın altındaki eylem, örn. "Yeniden dene" düğmesi. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const out = direction === "out";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-1 rounded-lg border px-3 py-2",
          out ? "rounded-br-sm border-transparent bg-bubble-out" : "rounded-bl-sm bg-bubble-in",
        )}
      >
        {/* Gelen mesajın kimden olduğu konumdan ve renkten anlaşılır; ekran okuyucu için adı ayrıca söylenir. */}
        {author ? <p className={out ? "text-xs text-muted" : "sr-only"}>{author}</p> : null}
        <p className="text-sm break-words whitespace-pre-wrap text-fg">{children}</p>
        <p className="flex items-center justify-end gap-1 text-xs text-muted">
          <time>{time}</time>
          {out && status ? <StatusIcon status={status} label={statusLabel} /> : null}
        </p>
        {status === "failed" ? (
          <p className="text-xs text-danger">
            {statusLabel}
            {failure ? `: ${failure}` : null}
          </p>
        ) : null}
        {status === "failed" && action ? <div className="flex justify-end">{action}</div> : null}
      </div>
    </div>
  );
}
