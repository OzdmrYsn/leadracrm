"use client";

import { useState } from "react";
import { Ellipsis, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { AccessLevelControl, type AccessLevel } from "@/components/ui/access-level";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dialog, DialogClose, Menu, Tabs, Tooltip } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Tag, type StageColor } from "@/components/ui/tag";
import { Checkbox, Switch } from "@/components/ui/toggle";

const stageOptions = [
  { value: "first", label: "İlk temas", swatch: "--stage-1" },
  { value: "talk", label: "Görüşme", swatch: "--stage-2" },
  { value: "offer", label: "Teklif", swatch: "--stage-3" },
  { value: "won", label: "Kazanıldı", swatch: "--stage-4" },
  { value: "archived", label: "Arşiv (kapalı)", swatch: "--stage-8", disabled: true },
];

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="primary"
      loading={loading}
      onClick={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 1500);
      }}
    >
      Kaydet
    </Button>
  );
}

export function FormDemo() {
  const [stage, setStage] = useState("talk");
  const [notify, setNotify] = useState(true);
  const [terms, setTerms] = useState<boolean | "indeterminate">("indeterminate");
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Field id="demo-name" label="Lead adı" required hint="Panodaki kartta bu ad görünür.">
          <Input id="demo-name" defaultValue="Mutfak yenileme" aria-describedby="demo-name-note" required />
        </Field>
        <Field id="demo-price" label="Tutar" error="Tutar bir sayı olmalı.">
          <Input id="demo-price" defaultValue="on bin" aria-invalid aria-describedby="demo-price-note" inputMode="decimal" />
        </Field>
        <Field id="demo-disabled" label="Kaynak">
          <Input id="demo-disabled" defaultValue="Telegram" disabled />
        </Field>
      </div>
      <div className="flex flex-col gap-4">
        <Field id="demo-stage" label="Aşama">
          <Select id="demo-stage" value={stage} onValueChange={setStage} options={stageOptions} placeholder="Aşama seçin" />
        </Field>
        <Field id="demo-note" label="Not">
          <Textarea id="demo-note" placeholder="Görüşmeden aklınızda kalanlar" />
        </Field>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm text-fg">
            <Checkbox checked={terms} onCheckedChange={setTerms} />
            Mevcut lead&apos;lere de uygula
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-fg">
            Yeni mesajda bildirim gönder
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
        </div>
      </div>
    </div>
  );
}

export function TagDemo() {
  const [tags, setTags] = useState<Array<{ label: string; color?: StageColor }>>([
    { label: "VIP", color: 5 },
    { label: "Acil", color: 6 },
    { label: "Yeniden arama", color: 2 },
    { label: "Bayi" },
  ]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <Tag
          key={tag.label}
          color={tag.color}
          removeLabel={`${tag.label} etiketini kaldır`}
          onRemove={() => setTags((current) => current.filter((item) => item.label !== tag.label))}
        >
          {tag.label}
        </Tag>
      ))}
      {tags.length === 0 ? <span className="text-sm text-muted">Etiket yok</span> : null}
    </div>
  );
}

export function OverlayDemo() {
  const [last, setLast] = useState("Henüz bir şey seçilmedi");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Dialog
          title="Lead silinsin mi?"
          description="Lead çöp kutusuna taşınır. 30 gün içinde geri alabilirsiniz."
          closeLabel="Pencereyi kapat"
          trigger={<Button variant="secondary">Pencereyi aç</Button>}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Vazgeç</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger" onClick={() => setLast("Lead çöp kutusuna taşındı")}>
                  Çöpe taşı
                </Button>
              </DialogClose>
            </>
          }
        >
          <p className="text-sm text-fg">Mutfak yenileme · Deniz Arslan</p>
        </Dialog>

        <Menu
          trigger={
            <Button variant="secondary" icon={<Plus aria-hidden />}>
              Ekle
            </Button>
          }
          align="start"
          items={[
            { label: "Not", icon: <Pencil aria-hidden />, onSelect: () => setLast("Not seçildi") },
            { label: "Görev", icon: <UserRound aria-hidden />, onSelect: () => setLast("Görev seçildi") },
            { kind: "separator" },
            { label: "Lead'i sil", icon: <Trash2 aria-hidden />, danger: true, onSelect: () => setLast("Sil seçildi") },
          ]}
        />

        <Tooltip label="Diğer işlemler">
          <Button variant="ghost" iconOnly aria-label="Diğer işlemler">
            <Ellipsis aria-hidden />
          </Button>
        </Tooltip>

        <span role="status" className="text-sm text-muted">
          {last}
        </span>
      </div>

      <Tabs
        label="Lead kartı bölümleri"
        tabs={[
          { value: "main", label: "Bilgiler", content: <p className="text-sm text-muted">Alanlar burada düzenlenir.</p> },
          { value: "tasks", label: "Görevler", content: <p className="text-sm text-muted">Planlı görev yok.</p> },
          { value: "files", label: "Dosyalar", content: <p className="text-sm text-muted">Henüz dosya eklenmedi.</p> },
        ]}
      />
    </div>
  );
}

const accessLabels: Record<AccessLevel, string> = {
  none: "Yok",
  own: "Kendi",
  group: "Grubu",
  all: "Tümü",
};

const accessRows: Array<{ key: string; label: string; initial: AccessLevel }> = [
  { key: "view", label: "Görüntüle", initial: "group" },
  { key: "edit", label: "Düzenle", initial: "own" },
  { key: "delete", label: "Sil", initial: "none" },
  { key: "export", label: "Dışa aktar", initial: "none" },
];

export function AccessDemo() {
  const [levels, setLevels] = useState<Record<string, AccessLevel>>(
    Object.fromEntries(accessRows.map((row) => [row.key, row.initial])),
  );
  return (
    <div className="flex flex-col gap-2">
      {accessRows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4">
          <span className="text-sm text-fg">{row.label}</span>
          <AccessLevelControl
            label={`Lead'ler: ${row.label}`}
            labels={accessLabels}
            value={levels[row.key]}
            onValueChange={(value) => setLevels((current) => ({ ...current, [row.key]: value }))}
          />
        </div>
      ))}
    </div>
  );
}
