// Raporlar: bir dönemin özeti. Bütün sayılar kullanıcının görebildiği kayıtlardan hesaplanır (RLS);
// kapsamı "kendi" olan üye yalnız kendi lead'lerinin raporunu görür.
import { addDays, dayOf, zonedToUtc } from "@/lib/dates";
import type { Id, Insights } from "@/lib/types";
import { isUuid } from "../errors";
import { inWorkspace, listUsers } from "./ctx";

/** Sunulan dönemler (gün). Asıl üründeki üst sınıra uygun olarak en çok 65 gün. */
export const INSIGHT_DAYS = [7, 30, 65] as const;

export function getInsights(ws: string, input: { days?: number; responsible?: string }): Promise<Insights> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const days = (INSIGHT_DAYS as readonly number[]).includes(input.days ?? 30) ? (input.days ?? 30) : 30;
    const timeZone = ctx.ws.timezone;
    const to = dayOf(Date.now(), timeZone);
    const from = addDays(to, -(days - 1));
    // Dönem, çalışma alanının saat diliminde ilk günün başından şimdiye kadardır.
    const since = zonedToUtc(from, "00:00", timeZone);

    const who = input.responsible;
    const none = sql`and false`;
    const byLead = !who ? sql`` : who === "none" ? sql`and l.responsible_user_id is null` : isUuid(who) ? sql`and l.responsible_user_id = ${who}` : none;
    const byTask = !who ? sql`` : who === "none" ? sql`and t.responsible_user_id is null` : isUuid(who) ? sql`and t.responsible_user_id = ${who}` : none;
    const leads = sql`from leads l join stages st on st.id = l.stage_id where l.workspace_id = ${ctx.ws.id} and l.deleted_at is null ${byLead}`;

    const [totals] = await sql<Array<Omit<Insights["totals"], "tasksDone" | "tasksOverdue">>>`
      select
        (count(*) filter (where l.created_at >= ${since}))::int as created,
        (count(*) filter (where st.kind = 'won' and l.closed_at >= ${since}))::int as won,
        coalesce(sum(l.price_minor) filter (where st.kind = 'won' and l.closed_at >= ${since}), 0)::float8 as won_minor,
        (count(*) filter (where st.kind = 'lost' and l.closed_at >= ${since}))::int as lost,
        coalesce(sum(l.price_minor) filter (where st.kind = 'lost' and l.closed_at >= ${since}), 0)::float8 as lost_minor,
        (count(*) filter (where st.kind in ('incoming', 'open')))::int as open,
        coalesce(sum(l.price_minor) filter (where st.kind in ('incoming', 'open')), 0)::float8 as open_minor
      ${leads}`;
    const [tasks] = await sql<Array<{ tasksDone: number; tasksOverdue: number }>>`
      select (count(*) filter (where t.completed_at >= ${since}))::int as tasks_done,
        (count(*) filter (where t.completed_at is null and t.due_at < now()))::int as tasks_overdue
      from tasks t where t.workspace_id = ${ctx.ws.id} ${byTask}`;

    const perDay = await sql<Array<{ day: string; created: number }>>`
      select (l.created_at at time zone ${timeZone})::date::text as day, count(*)::int as created
      ${leads} and l.created_at >= ${since} group by 1`;
    const counts = new Map(perDay.map((row) => [row.day, row.created]));
    const daily = Array.from({ length: days }, (_, index) => {
      const day = addDays(from, index);
      return { day, created: counts.get(day) ?? 0 };
    });

    const stages = await sql<Insights["stages"]>`
      select st.id, st.name, p.name as pipeline,
        (select count(*) from leads l where l.stage_id = st.id and l.deleted_at is null ${byLead})::int as count,
        (select coalesce(sum(l.price_minor), 0) from leads l where l.stage_id = st.id and l.deleted_at is null ${byLead})::float8 as total_minor
      from stages st join pipelines p on p.id = st.pipeline_id
      where st.workspace_id = ${ctx.ws.id} and st.kind in ('incoming', 'open') and p.archived_at is null
      order by p.is_main desc, p.sort, p.created_at, st.sort`;

    const lossReasons = await sql<Insights["lossReasons"]>`
      select lr.id, lr.name, count(*)::int as count
      from leads l join stages st on st.id = l.stage_id left join loss_reasons lr on lr.id = l.loss_reason_id
      where l.workspace_id = ${ctx.ws.id} and l.deleted_at is null ${byLead} and st.kind = 'lost' and l.closed_at >= ${since}
      group by lr.id, lr.name order by count(*) desc, lr.name nulls last`;

    // "Yeni lead" oluşturana, kazanılan ve kaybedilen şimdiki sorumluya yazılır.
    const created = await sql<Array<{ id: Id | null; created: number }>>`
      select l.created_by as id, count(*)::int as created ${leads} and l.created_at >= ${since} group by l.created_by`;
    const closed = await sql<Array<{ id: Id | null; won: number; lost: number; wonMinor: number }>>`
      select l.responsible_user_id as id,
        (count(*) filter (where st.kind = 'won'))::int as won,
        (count(*) filter (where st.kind = 'lost'))::int as lost,
        coalesce(sum(l.price_minor) filter (where st.kind = 'won'), 0)::float8 as won_minor
      ${leads} and st.kind in ('won', 'lost') and l.closed_at >= ${since} group by l.responsible_user_id`;
    const members = await listUsers(ctx);
    const ids = [...new Set<Id | null>([...members.map((user) => user.id), ...created.map((row) => row.id), ...closed.map((row) => row.id)])];
    const users = ids
      .map((id) => {
        const made = created.find((row) => row.id === id);
        const done = closed.find((row) => row.id === id);
        return { id, name: members.find((user) => user.id === id)?.name ?? null, created: made?.created ?? 0, won: done?.won ?? 0, lost: done?.lost ?? 0, wonMinor: done?.wonMinor ?? 0 };
      })
      // Hiçbir şeyi olmayan satırlar (ve artık üye olmayan adsız kişiler) gösterilmez; "sahipsiz" satırı yalnız doluysa çıkar.
      .filter((row) => row.created + row.won + row.lost > 0 || (row.id !== null && row.name !== null))
      .sort((a, b) => b.wonMinor - a.wonMinor || b.won - a.won || b.created - a.created || (a.name ?? "￿").localeCompare(b.name ?? "￿", ctx.ws.locale));

    const events = await sql<Insights["events"]>`
      select e.id, e.lead_id, l.name as lead_name, e.type, p.full_name as actor_name,
        case when e.actor_kind in ('automation', 'integration') then e.actor_kind when e.actor_user_id is null then 'system' else 'user' end as actor_kind,
        e.value_before ->> 'text' as "from", e.value_after ->> 'text' as "to", e.created_at
      from events e join leads l on l.id = e.lead_id left join profiles p on p.id = e.actor_user_id
      where e.workspace_id = ${ctx.ws.id} and l.deleted_at is null ${byLead}
      order by e.created_at desc, e.id limit 30`;

    return {
      range: { days, from, to },
      totals: { ...totals, ...tasks },
      daily,
      stages: stages.map((row) => ({ ...row })),
      lossReasons: lossReasons.map((row) => ({ ...row })),
      users,
      events: events.map((row) => ({ ...row })),
    };
  });
}
