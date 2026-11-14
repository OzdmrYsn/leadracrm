// Kayıtlı süzgeçler: kullanıcının adlandırıp sakladığı lead süzgeçleri. Kişiseldir; başkası göremez (RLS de aynısını zorlar).
import type { Id, SavedFilter } from "@/lib/types";
import { DataError, isUuid, notFound } from "../errors";
import { inWorkspace } from "./ctx";

const MAX_PER_USER = 30;

export function listSavedFilters(ws: string): Promise<SavedFilter[]> {
  return inWorkspace(ws, async (ctx) => {
    const rows = await ctx.sql<SavedFilter[]>`
      select id, name, criteria from saved_filters
      where workspace_id = ${ctx.ws.id} and entity_type = 'lead' and user_id = ${ctx.user.id}
      order by sort, created_at, id`;
    return rows.map((row) => ({ ...row }));
  });
}

export function createSavedFilter(ws: string, input: { name: string; criteria: Record<string, unknown> }): Promise<SavedFilter> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    const [{ count }] = await sql<Array<{ count: number }>>`
      select count(*)::int as count from saved_filters where workspace_id = ${ctx.ws.id} and entity_type = 'lead' and user_id = ${ctx.user.id}`;
    if (count >= MAX_PER_USER) throw new DataError(422, "filter_limit", "too many saved filters");
    const [row] = await sql<SavedFilter[]>`
      insert into saved_filters (workspace_id, user_id, entity_type, name, criteria, sort)
      values (${ctx.ws.id}, ${ctx.user.id}, 'lead', ${input.name.trim()}, ${sql.json(JSON.parse(JSON.stringify(input.criteria)))}, ${(count + 1) * 10})
      returning id, name, criteria`;
    return { ...row };
  });
}

export function deleteSavedFilter(ws: string, filterId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    if (!isUuid(filterId)) throw notFound("filter");
    const deleted = await ctx.sql`
      delete from saved_filters where id = ${filterId} and workspace_id = ${ctx.ws.id} and user_id = ${ctx.user.id} returning id`;
    if (deleted.length === 0) throw notFound("filter");
  });
}
