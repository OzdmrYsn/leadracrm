import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CircleCheck, Inbox, Info, Plus, SendHorizontal, TriangleAlert } from "lucide-react";
import tokens from "../../../replica/design/tokens.json";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConversationItem, LeadCard, MessageBubble, StageHeader } from "@/components/ui/crm";
import { EmptyState, Notice, Skeleton, Spinner } from "@/components/ui/feedback";
import { Badge, CountBadge, Tag } from "@/components/ui/tag";
import { tr } from "@/i18n/tr";
import { AccessDemo, FormDemo, LoadingButtonDemo, OverlayDemo, TagDemo } from "./demos";

export const metadata: Metadata = { title: `Tasarım sistemi · ${tr.app.name}` };

// Yalnız geliştirme içindir; üretim derlemesinde 404 döner.

const colorRoles = Object.entries(tokens.color).flatMap(([name, value]) =>
  typeof value === "string"
    ? [{ name, value }]
    : Object.entries(value).map(([step, hex]) => ({ name: `${name}-${step}`, value: hex })),
);

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg text-fg">{title}</h2>
        {note ? <p className="max-w-2xl text-sm text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl text-fg">Tasarım sistemi</h1>
        <p className="max-w-2xl text-base text-muted">
          Bütün değerler replica/design/tokens.json dosyasından gelir. Vurgu rengi şimdilik nötr bir yer tutucudur; marka
          adımında değişecek.
        </p>
      </header>

      <Section title="Renk rolleri" note="Bileşenler rengin adını değil rolünü kullanır.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {colorRoles.map((role) => (
            <li key={role.name} className="flex flex-col gap-1">
              <span className="h-12 rounded-md border" style={{ background: `var(--${role.name})` }} />
              <span className="text-xs text-fg">{role.name}</span>
              <span className="font-mono text-xs text-muted">{role.value}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Yazı ölçeği" note="Arayüzün varsayılanı sm (14 piksel). Türkçe karakterler: İ ı Ş ş Ğ ğ Ö ö Ü ü Ç ç.">
        <div className="flex flex-col gap-3">
          {Object.entries(tokens.type).map(([name, spec]) => (
            <div key={name} className="flex items-baseline gap-4">
              <span className="w-28 shrink-0 font-mono text-xs text-muted">
                {name} · {spec.size}/{spec.line}
              </span>
              <span
                className="truncate text-fg"
                style={{
                  fontSize: `var(--text-${name})`,
                  lineHeight: `var(--text-${name}--line-height)`,
                  fontWeight: `var(--text-${name}--font-weight)`,
                }}
              >
                Işıl&apos;ın siparişi yarın öğleden sonra teslim edilecek
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Köşe, gölge, aralık">
        <div className="flex flex-wrap items-end gap-6">
          {Object.entries(tokens.radius).map(([name, value]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <span className="size-14 border border-border-input bg-surface" style={{ borderRadius: `var(--radius-${name})` }} />
              <span className="font-mono text-xs text-muted">
                {name} · {value}
              </span>
            </div>
          ))}
          {Object.keys(tokens.shadow).map((name) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <span className="size-14 rounded-md bg-bg" style={{ boxShadow: `var(--shadow-${name})` }} />
              <span className="font-mono text-xs text-muted">{name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {tokens.space
            .filter((step) => step > 0)
            .map((step) => (
              <div key={step} className="flex flex-col items-center gap-1">
                <span className="bg-accent" style={{ width: step, height: step }} />
                <span className="font-mono text-xs text-muted">{step}</span>
              </div>
            ))}
        </div>
      </Section>

      <Section title="Düğme" note="Varsayılan ikincildir. Bir ekranda tek birincil düğme olur.">
        <Row label="Çeşitler">
          <Button variant="primary">Lead ekle</Button>
          <Button variant="secondary">Dışa aktar</Button>
          <Button variant="ghost">Vazgeç</Button>
          <Button variant="danger">Sil</Button>
        </Row>
        <Row label="Boyutlar">
          <Button size="sm">Küçük 32</Button>
          <Button size="md">Orta 40</Button>
          <Button size="lg">Büyük 48</Button>
          <Button variant="primary" icon={<Plus aria-hidden />}>
            Simgeli
          </Button>
          <Button iconOnly aria-label="Lead ekle">
            <Plus aria-hidden />
          </Button>
        </Row>
        <Row label="Durumlar">
          <Button variant="primary" disabled>
            Devre dışı
          </Button>
          <Button variant="primary" loading>
            Kaydediliyor
          </Button>
          <LoadingButtonDemo />
        </Row>
      </Section>

      <Section title="Form alanları" note="Etiket her zaman görünür. Hata, alanın altında ve metinle söylenir.">
        <FormDemo />
      </Section>

      <Section title="Etiket, rozet, avatar">
        <Row label="Etiketler (kaldırılabilir)">
          <TagDemo />
        </Row>
        <Row label="Aşama paleti">
          {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((color) => (
            <Tag key={color} color={color}>
              Renk {color}
            </Tag>
          ))}
        </Row>
        <Row label="Durum rozetleri ve sayaç">
          <Badge>Taslak</Badge>
          <Badge tone="success" icon={<CircleCheck aria-hidden />}>
            Bağlı
          </Badge>
          <Badge tone="warning">Onay bekliyor</Badge>
          <Badge tone="danger">Bağlantı koptu</Badge>
          <Badge tone="info">Deneme sürümü</Badge>
          <CountBadge count={3} label="3 okunmamış mesaj" />
          <CountBadge count={128} label="128 okunmamış mesaj" />
        </Row>
        <Row label="Avatar">
          <Avatar name="ışıl ince" size="sm" locale="tr" />
          <Avatar name="Deniz Arslan" size="md" locale="tr" />
          <Avatar name="Kuzey Mobilya" size="lg" locale="tr" />
        </Row>
      </Section>

      <Section title="Geri bildirim" note="Boş, yükleniyor ve hata durumları her ekranda aynı kalıbı kullanır.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-md border">
            <EmptyState
              icon={<Inbox />}
              title="Planlı görev yok"
              body="Bu lead için bir sonraki adımı belirleyin; unutulmasın."
              action={
                <Button variant="primary" size="sm" icon={<Plus aria-hidden />}>
                  Görev ekle
                </Button>
              }
            />
          </div>
          <div className="flex flex-col gap-3">
            <Spinner label="Mesajlar yükleniyor" />
            <div aria-busy className="flex flex-col gap-2 rounded-md border p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Notice tone="info" icon={<Info aria-hidden />}>
              Bu müşteriyle son yazışmanın üzerinden 24 saat geçti. Yalnız onaylı şablon gönderebilirsiniz.
            </Notice>
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
              Lead limitinin yüzde 90&apos;ına ulaştınız.
            </Notice>
            <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
              Mesaj gönderilemedi. Kanal bağlantısını denetleyin.
            </Notice>
            <Notice tone="success" icon={<CircleCheck aria-hidden />}>
              Telegram botu bağlandı.
            </Notice>
          </div>
        </div>
      </Section>

      <Section title="Pencere, menü, ipucu, sekme" note="Klavyeyle deneyin: Tab, Enter, ok tuşları, Esc.">
        <OverlayDemo />
      </Section>

      <Section title="Pano" note="Sütun 288 piksel. Kart, lead adını, kişiyi, son mesajı ve bir sonraki adımın olup olmadığını gösterir.">
        <div className="flex gap-4 overflow-x-auto rounded-lg bg-surface p-4">
          <div className="flex w-(--layout-board-column) shrink-0 flex-col gap-2">
            <StageHeader name="Gelen talepler" color={8} countLabel="1 lead" />
            <LeadCard
              name="Telegram talebi"
              contact="Elif Kaya"
              lastMessage="Merhaba, mutfak dolabı için fiyat alabilir miyim?"
              time="2 dk"
              unread={2}
              unreadLabel="2 okunmamış mesaj"
            />
          </div>
          <div className="flex w-(--layout-board-column) shrink-0 flex-col gap-2">
            <StageHeader name="Görüşme" color={2} countLabel="2 lead" total="₺96.000" />
            <LeadCard
              name="Mutfak yenileme"
              contact="Deniz Arslan · Kuzey Mobilya"
              price="₺64.000"
              lastMessage="Ölçüleri yarın gönderiyorum."
              time="1 sa"
              tags={[{ label: "VIP", color: 5 }, { label: "Bayi" }]}
              owner="Ada Yıldız"
              locale="tr"
            />
            <LeadCard name="Ofis masaları" contact="Mert Demir" price="₺32.000" time="3 g" noTaskLabel="Görev yok" owner="Bora Şahin" locale="tr" />
          </div>
          <div className="flex w-(--layout-board-column) shrink-0 flex-col gap-2">
            <StageHeader name="Teklif" color={3} countLabel="1 lead" total="₺18.500" />
            <LeadCard name="Çok uzun bir lead adı, altmış karakteri geçince kart taşmadan kısalır" price="₺18.500" time="5 g" owner="Ada Yıldız" locale="tr" dragging />
          </div>
        </div>
      </Section>

      <Section title="Gelen kutusu ve yazışma" note="Liste 340 piksel. Giden mesajda teslim durumu simge ve okunur metinle verilir.">
        <div className="grid grid-cols-1 overflow-hidden rounded-lg border md:grid-cols-[var(--layout-inbox-list)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col divide-y border-b md:border-r md:border-b-0">
            <ConversationItem name="Elif Kaya" channel="Telegram" preview="Merhaba, mutfak dolabı için fiyat alabilir miyim?" time="14:02" unread={2} unreadLabel="2 okunmamış mesaj" locale="tr" />
            <ConversationItem name="Deniz Arslan" channel="WhatsApp" preview="Ölçüleri yarın gönderiyorum." time="13:10" selected locale="tr" />
            <ConversationItem name="Mert Demir" channel="Telegram" preview="Teşekkürler, haber bekliyorum." time="Salı" locale="tr" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-col gap-3 p-4">
              <MessageBubble direction="in" time="13:02">
                Merhaba, geçen hafta konuştuğumuz mutfak için ölçü almaya ne zaman gelebilirsiniz?
              </MessageBubble>
              <MessageBubble direction="out" time="13:05" status="read" statusLabel="Okundu" author="Ada Yıldız">
                Merhaba Deniz Hanım, perşembe 10:00 uygun mu?
              </MessageBubble>
              <MessageBubble direction="in" time="13:10">
                Ölçüleri yarın gönderiyorum.
              </MessageBubble>
              <MessageBubble direction="out" time="13:11" status="delivered" statusLabel="İletildi" author="Ada Yıldız">
                Harika, bekliyorum.
              </MessageBubble>
              <MessageBubble direction="out" time="13:12" status="failed" statusLabel="Gönderilemedi. Yeniden deneyin." author="Ada Yıldız">
                Teklif dosyası ekte.
              </MessageBubble>
            </div>
            <div className="flex items-end gap-2 border-t p-3">
              <label htmlFor="design-composer" className="sr-only">
                Mesaj yazın
              </label>
              <textarea
                id="design-composer"
                rows={1}
                placeholder="Mesaj yazın"
                className="min-h-10 flex-1 resize-none rounded-md border border-border-input bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted"
              />
              <Button variant="primary" iconOnly aria-label="Gönder">
                <SendHorizontal aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Yetki matrisi hücresi" note="Dört düzey: yok, yalnız sorumlu olduğu, grubunun, tümü. Renk düzeyi destekler; düzey her zaman yazıyla okunur.">
        <div className="max-w-md rounded-md border p-4">
          <AccessDemo />
        </div>
      </Section>
    </main>
  );
}
