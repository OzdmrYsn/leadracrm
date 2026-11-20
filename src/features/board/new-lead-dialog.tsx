"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { Plus, TriangleAlert, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { ContactPicker } from "@/features/contacts/contact-picker";
import { TagPicker } from "@/features/tags/tag-picker";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { parseMoney } from "@/lib/format";
import { useCreateLead, useTags } from "@/lib/hooks";
import type { Id, Session } from "@/lib/types";

const UNASSIGNED = "none";

function NewLeadForm({ ws, session, pipelineId, stageId: initialStageId, onDone }: { ws: string; session: Session; pipelineId?: Id; stageId?: Id; onDone: () => void }) {
  const { t } = useI18n();
  const create = useCreateLead(ws);
  const tags = useTags(ws);
  const pipeline =
    session.pipelines.find((item) => item.id === pipelineId) ?? session.pipelines.find((item) => item.isMain) ?? session.pipelines[0];
  const stages = pipeline.stages.filter((stage) => stage.kind === "open").sort((a, b) => a.sort - b.sort);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stageId, setStageId] = useState(stages.find((stage) => stage.id === initialStageId)?.id ?? stages[0]?.id ?? "");
  const [responsible, setResponsible] = useState(session.user.id);
  const [contact, setContact] = useState<{ id: Id; name: string } | null>(null);
  const [tagIds, setTagIds] = useState<Id[]>([]);
  const [errors, setErrors] = useState<{ name?: string; price?: string; form?: string }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const priceMinor = parseMoney(price);
    const next: typeof errors = {};
    if (name.trim() === "") next.name = t.newLead.nameRequired;
    if (priceMinor === null) next.price = t.newLead.priceInvalid;
    setErrors(next);
    if (next.name || next.price || priceMinor === null) return;

    create.mutate(
      {
        name,
        priceMinor,
        stageId,
        responsibleUserId: responsible === UNASSIGNED ? null : responsible,
        contactId: contact?.id,
        tagIds,
      },
      {
        onSuccess: onDone,
        onError: (error) => setErrors({ form: errorText(error, t) }),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.form ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {errors.form}
        </Notice>
      ) : null}
      <Field id="new-lead-name" label={t.newLead.name} required hint={t.newLead.nameHint} error={errors.name}>
        <Input
          id="new-lead-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby="new-lead-name-note"
          maxLength={255}
          required
          autoFocus
        />
      </Field>
      <Field id="new-lead-price" label={fill(t.newLead.price, { currency: session.workspace.currency })} error={errors.price}>
        <Input
          id="new-lead-price"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          aria-invalid={errors.price ? true : undefined}
          aria-describedby={errors.price ? "new-lead-price-note" : undefined}
          inputMode="decimal"
          placeholder="0"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="new-lead-stage" label={t.newLead.stage}>
          <Select
            id="new-lead-stage"
            value={stageId}
            onValueChange={setStageId}
            options={stages.map((stage) => ({ value: stage.id, label: stage.name, swatch: `--stage-${stage.color}` }))}
          />
        </Field>
        <Field id="new-lead-responsible" label={t.newLead.responsible}>
          <Select
            id="new-lead-responsible"
            value={responsible}
            onValueChange={setResponsible}
            options={[
              ...session.users.map((user) => ({ value: user.id, label: user.name })),
              { value: UNASSIGNED, label: t.common.unassigned },
            ]}
          />
        </Field>
      </div>
      {/* Kişi serbest metin değildir: var olan aranır ya da yazılan adla yenisi oluşturulur; böylece aynı kişi çoğalmaz. */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">{t.newLead.contact}</span>
        <div className="flex flex-wrap items-center gap-2">
          {contact ? <span className="min-w-0 truncate text-sm text-fg">{contact.name}</span> : null}
          <ContactPicker
            ws={ws}
            locale={session.workspace.locale}
            onPick={async (id, pickedName) => setContact({ id, name: pickedName })}
            trigger={
              <Button size="sm" icon={contact ? undefined : <UserRoundPlus aria-hidden />}>
                {contact ? t.contact.change : t.contact.link}
              </Button>
            }
          />
          {contact ? (
            <Button variant="ghost" size="sm" onClick={() => setContact(null)}>
              {t.contact.unlink}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">{t.newLead.contactHint}</p>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">{t.lead.tags}</span>
        <div className="flex flex-wrap items-center gap-1">
          {(tags.data ?? [])
            .filter((tag) => tagIds.includes(tag.id))
            .map((tag) => (
              <Tag
                key={tag.id}
                color={tag.color}
                removeLabel={fill(t.tags.remove, { name: tag.name })}
                onRemove={() => setTagIds((current) => current.filter((id) => id !== tag.id))}
              >
                {tag.name}
              </Tag>
            ))}
          <TagPicker
            ws={ws}
            selectedIds={tagIds}
            onChange={setTagIds}
            trigger={
              <Button variant="ghost" size="sm" icon={<Plus aria-hidden />}>
                {t.tags.add}
              </Button>
            }
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t.newLead.submit}
        </Button>
      </div>
    </form>
  );
}

/** Yeni lead penceresi. Kapanınca form sıfırlanır. */
export function NewLeadDialog({
  ws,
  session,
  pipelineId,
  stageId,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  ws: string;
  session: Session;
  /** Verilmezse ana pipeline kullanılır. */
  pipelineId?: Id;
  /** Pencere açılırken seçili gelecek aşama (sütundan hızlı ekleme). Verilmezse ilk açık aşama. */
  stageId?: Id;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pencereyi açan düğme; kapanınca odak buraya döner. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={t.newLead.title}
      description={t.newLead.description}
      closeLabel={t.common.close}
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
    >
      <NewLeadForm ws={ws} session={session} pipelineId={pipelineId} stageId={stageId} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
