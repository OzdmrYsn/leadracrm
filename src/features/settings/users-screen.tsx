"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { NameInput } from "@/components/ui/name-input";
import { Dialog } from "@/components/ui/overlay";
import { Select } from "@/components/ui/select";
import { SortTh } from "@/components/ui/sort-th";
import { Badge } from "@/components/ui/tag";
import { Checkbox } from "@/components/ui/toggle";
import { fill, useI18n } from "@/i18n";
import { errorText } from "@/lib/errors";
import { useCreateGroup, useDeleteGroup, useGroups, useMembers, useSession, useUpdateGroup, useUpdateMember } from "@/lib/hooks";
import { RIGHTS_PRESETS } from "@/lib/rights";
import type { Group, Member, Rights } from "@/lib/types";
import { RightsEditor } from "./rights-editor";

const NO_GROUP = "none";

/* ---------- üye penceresi ---------- */

type MemberInput = { id: string; isAdmin?: boolean; isActive?: boolean; groupId: string | null; rights?: Rights };

/** Kaydet düğmesi pencerenin sabit alt şeridindedir ve forma formId ile bağlanır: uzun matriste kaydırmak gerekmez. */
function MemberForm({
  formId,
  member,
  groups,
  isSelf,
  problem,
  onSave,
}: {
  formId: string;
  member: Member;
  groups: Group[];
  isSelf: boolean;
  problem: string | null;
  onSave: (input: MemberInput) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [isAdmin, setIsAdmin] = useState(member.isAdmin);
  const [isActive, setIsActive] = useState(member.isActive);
  const [groupId, setGroupId] = useState(member.groupId ?? NO_GROUP);
  // Yetkisi hiç ayarlanmamış üye (yeni ya da eski yönetici) "kendi kayıtları" ile başlar.
  const [rights, setRights] = useState<Rights>(member.rights ?? RIGHTS_PRESETS.own);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      id: member.id,
      // Kendi rolünü ve etkinliğini değiştiremez; alanlar gönderilmez.
      ...(isSelf ? {} : { isAdmin, isActive }),
      groupId: groupId === NO_GROUP ? null : groupId,
      // Yöneticinin yetkileri kullanılmaz; üyeye dönerse eski matrisi yerinde durur.
      ...(isAdmin ? {} : { rights }),
    });
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}
      {isSelf ? <Notice tone="info">{t.team.selfNote}</Notice> : null}

      <div className="flex items-start gap-3">
        <Checkbox id={`${id}-admin`} checked={isAdmin} disabled={isSelf} onCheckedChange={(checked) => setIsAdmin(checked === true)} aria-describedby={`${id}-admin-note`} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={`${id}-admin`} className="text-sm font-medium text-fg">
            {t.team.adminLabel}
          </label>
          <p id={`${id}-admin-note`} className="text-xs text-muted">
            {t.team.adminHint}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id={`${id}-active`} checked={isActive} disabled={isSelf} onCheckedChange={(checked) => setIsActive(checked === true)} aria-describedby={`${id}-active-note`} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={`${id}-active`} className="text-sm font-medium text-fg">
            {t.team.activeLabel}
          </label>
          <p id={`${id}-active-note`} className="text-xs text-muted">
            {t.team.activeHint}
          </p>
        </div>
      </div>

      <Field id={`${id}-group`} label={t.team.groupLabel}>
        <Select
          id={`${id}-group`}
          value={groupId}
          onValueChange={setGroupId}
          options={[{ value: NO_GROUP, label: t.team.noGroup }, ...groups.map((group) => ({ value: group.id, label: group.name }))]}
        />
      </Field>

      <section aria-labelledby={`${id}-rights`} className="flex flex-col gap-2">
        <h3 id={`${id}-rights`} className="text-sm font-semibold text-fg">
          {t.team.rightsTitle}
        </h3>
        {isAdmin ? <p className="text-sm text-muted">{t.team.adminRights}</p> : <RightsEditor value={rights} onChange={setRights} />}
      </section>
    </form>
  );
}

/* ---------- gruplar ---------- */

function GroupsSection({ ws, groups, members, canEdit }: { ws: string; groups: Group[]; members: Member[]; canEdit: boolean }) {
  const { t } = useI18n();
  const headingId = useId();
  const createGroup = useCreateGroup(ws);
  const updateGroup = useUpdateGroup(ws);
  const deleteGroup = useDeleteGroup(ws);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fail = (error: unknown) => setProblem(errorText(error, t));

  function add(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    createGroup.mutate(name, {
      onError: fail,
      onSuccess: () => {
        setProblem(null);
        setName("");
      },
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-semibold text-fg">
          {t.groups.title}
        </h2>
        <p className="text-sm text-muted">{t.groups.body}</p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {problem ? (
        <Notice tone="danger" icon={<TriangleAlert aria-hidden />}>
          {problem}
        </Notice>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted">{t.groups.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => {
            const count = members.filter((member) => member.groupId === group.id).length;
            return (
              <li key={group.id} className="flex flex-col gap-2 rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit ? (
                    <NameInput
                      key={group.name}
                      value={group.name}
                      label={fill(t.groups.nameOf, { name: group.name })}
                      onSave={(next) =>
                        updateGroup.mutateAsync({ id: group.id, name: next }).then(
                          () => setProblem(null),
                          (error: unknown) => {
                            fail(error);
                            throw error;
                          },
                        )
                      }
                      className="h-8 min-w-40 flex-1"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 text-sm font-medium break-words text-fg">{group.name}</span>
                  )}
                  <span className="shrink-0 text-xs text-muted">{fill(t.groups.members, { count })}</span>
                  {canEdit ? (
                    <Button variant="ghost" size="sm" iconOnly aria-label={fill(t.groups.remove, { name: group.name })} onClick={() => setPendingDelete(group.id)} className="text-danger">
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {pendingDelete === group.id ? (
                  <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3">
                    <p className="text-sm text-fg">{fill(t.groups.removeBody, { name: group.name })}</p>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(null)}>
                        {t.common.cancel}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deleteGroup.isPending}
                        onClick={() =>
                          deleteGroup.mutate(group.id, {
                            onError: fail,
                            onSuccess: () => {
                              setProblem(null);
                              setPendingDelete(null);
                              setAnnouncement(fill(t.groups.removed, { name: group.name }));
                            },
                          })
                        }
                      >
                        {t.groups.removeConfirm}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field id={`${headingId}-new`} label={t.groups.newName}>
              <Input id={`${headingId}-new`} value={name} onChange={(event) => setName(event.target.value)} placeholder={t.groups.newPlaceholder} maxLength={80} />
            </Field>
          </div>
          <Button type="submit" icon={<Plus aria-hidden />} loading={createGroup.isPending} disabled={name.trim() === ""}>
            {t.groups.add}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/* ---------- ekran ---------- */

/** Ayarlar › Kullanıcılar: ekip listesi, üye başına rol, grup ve yetki matrisi; gruplar. */
export function UsersScreen({ ws }: { ws: string }) {
  const { t } = useI18n();
  const headingId = useId();
  const formId = useId();
  const session = useSession(ws);
  const members = useMembers(ws);
  const groups = useGroups(ws);
  const update = useUpdateMember(ws);
  const [editing, setEditing] = useState<Member | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const trigger = useRef<HTMLElement | null>(null);

  if (session.isPending || members.isPending || groups.isPending) {
    return (
      <div aria-busy className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (session.isError || members.isError || groups.isError || !session.data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<TriangleAlert />}
          title={t.common.loadFailed}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void members.refetch();
                void groups.refetch();
              }}
            >
              {t.common.retry}
            </Button>
          }
        />
      </div>
    );
  }

  const me = session.data.user;
  const locale = session.data.workspace.locale;
  const canEdit = me.isAdmin;
  const groupName = (id: string | null) => groups.data.find((group) => group.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-8 p-4">
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold text-fg">
            {t.team.title}
          </h2>
          <p className="text-sm text-muted">{t.team.body}</p>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        {!canEdit ? <Notice tone="info">{t.team.adminOnly}</Notice> : <Notice tone="info">{t.team.inviteNote}</Notice>}

        {/* relative: tablodaki yalnız ekran okuyucuya görünen (mutlak konumlu) metinler bu kabın içinde kalsın; yoksa sayfayı yana taşırırlar. */}
        <div className="relative overflow-x-auto rounded-md border">
          <table className="w-full min-w-2xl border-collapse text-left text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr className="border-b">
                <SortTh label={t.team.colName} />
                <SortTh label={t.team.colEmail} />
                <SortTh label={t.team.colRole} />
                <SortTh label={t.team.colGroup} />
                <SortTh label={t.team.colStatus} />
                {canEdit ? (
                  <th scope="col" className="px-3 py-1 font-medium">
                    <span className="sr-only">{t.team.colActions}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {members.data.map((member) => (
                <tr key={member.id} className="border-b last:border-b-0">
                  <th scope="row" className="max-w-56 px-3 py-2 font-medium">
                    <span className="flex items-center gap-2 text-fg">
                      <Avatar name={member.name} size="sm" locale={locale} decorative />
                      <span className="truncate">{member.name}</span>
                      {member.id === me.id ? <span className="shrink-0 text-xs font-normal text-muted">({t.team.you})</span> : null}
                    </span>
                  </th>
                  <td className="max-w-56 truncate px-3 py-2 text-fg">{member.email}</td>
                  <td className="px-3 py-2">{member.isAdmin ? <Badge tone="info">{t.team.roleAdmin}</Badge> : <Badge>{t.team.roleMember}</Badge>}</td>
                  <td className="max-w-40 truncate px-3 py-2 text-fg">{groupName(member.groupId) ?? <span className="text-muted">{t.team.noGroup}</span>}</td>
                  <td className="px-3 py-2">{member.isActive ? <Badge tone="success">{t.team.active}</Badge> : <Badge>{t.team.inactive}</Badge>}</td>
                  {canEdit ? (
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil aria-hidden />}
                        aria-label={fill(t.team.editLabel, { name: member.name })}
                        onClick={(event) => {
                          trigger.current = event.currentTarget;
                          setProblem(null);
                          setEditing(member);
                        }}
                      >
                        {t.team.edit}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <GroupsSection ws={ws} groups={groups.data} members={members.data} canEdit={canEdit} />

      <Dialog
        title={editing?.name ?? ""}
        description={editing?.email}
        closeLabel={t.common.close}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        returnFocusTo={trigger}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={update.isPending}>
              {t.common.save}
            </Button>
          </>
        }
      >
        {editing ? (
          <MemberForm
            key={editing.id}
            formId={formId}
            member={editing}
            groups={groups.data}
            isSelf={editing.id === me.id}
            problem={problem}
            onSave={(input) => {
              setProblem(null);
              update.mutate(input, {
                onSuccess: (saved) => {
                  setEditing(null);
                  setAnnouncement(fill(t.team.saved, { name: saved.name }));
                },
                onError: (error) => setProblem(errorText(error, t)),
              });
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
