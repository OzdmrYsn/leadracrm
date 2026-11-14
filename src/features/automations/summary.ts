import { fill } from "@/i18n";
import type { Messages } from "@/i18n/tr";
import type { AutomationAction, Stage, Tag, TaskType, User } from "@/lib/types";

export type Lookup = { users: User[]; stages: Stage[]; tags: Tag[]; taskTypes: TaskType[] };

/** Hazır son tarih seçenekleri, dakika cinsinden. */
export const DUE_OPTIONS = [0, 60, 1440, 4320, 10080] as const;

export function dueLabel(minutes: number, t: Messages): string {
  const due = t.automations.due;
  if (minutes === 0) return due.now;
  if (minutes === 60) return due.hour;
  if (minutes === 1440) return due.day;
  if (minutes === 4320) return due.threeDays;
  if (minutes === 10080) return due.week;
  return fill(due.minutes, { n: minutes });
}

/** Tetikleyicinin ne yaptığını tek cümleyle anlatır. Silinmiş bir kayda işaret ediyorsa bunu söyler. */
export function describeAction(action: AutomationAction, lookup: Lookup, t: Messages): string {
  const s = t.automations.summary;
  const userName = (id: string) => lookup.users.find((user) => user.id === id)?.name ?? s.missing;
  const tagNames = (ids: string[]) => ids.map((id) => lookup.tags.find((tag) => tag.id === id)?.name ?? s.missing).join(", ");
  switch (action.kind) {
    case "change_responsible":
      return action.settings.mode === "user"
        ? fill(s.user, { name: userName(action.settings.userId) })
        : fill(s.roundRobin, { names: action.settings.userIds.map(userName).join(", ") });
    case "add_task": {
      const type = lookup.taskTypes.find((item) => item.id === action.settings.typeId)?.name ?? s.missing;
      return fill(s.task, { task: action.settings.text || type, due: dueLabel(action.settings.dueInMinutes, t) });
    }
    case "change_stage":
      return fill(s.stage, { stage: lookup.stages.find((stage) => stage.id === action.settings.stageId)?.name ?? s.missing });
    case "edit_tags":
      return [
        action.settings.add.length ? fill(s.tagsAdd, { names: tagNames(action.settings.add) }) : null,
        action.settings.remove.length ? fill(s.tagsRemove, { names: tagNames(action.settings.remove) }) : null,
      ]
        .filter(Boolean)
        .join(" · ");
  }
}
