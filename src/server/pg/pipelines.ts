// Pipeline ve aşama yönetimi. Yalnız yönetici yazar; RLS de aynısını zorlar.
import type { StageColor } from "@/components/ui/tag";
import type { Id, LossReason, Pipeline, Stage, StageNames } from "@/lib/types";
import { DataError, isUuid, notFound } from "../errors";
import { inWorkspace, logEvent, requireAdmin } from "./ctx";
import { findStage, loadPipeline, openStages } from "./shared";

const MAX_PIPELINES = 50;
const MAX_STAGES = 100;
const PALETTE: StageColor[] = [1, 2, 3, 5, 7];

export function createPipeline(ws: string, input: { name: string; stageNames: StageNames }): Promise<Pipeline> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    requireAdmin(ctx);
    const [{ count }] = await sql<Array<{ count: number }>>`select count(*)::int as count from pipelines where workspace_id = ${ctx.ws.id}`;
    if (count >= MAX_PIPELINES) throw new DataError(422, "pipeline_limit");
    const [pipeline] = await sql<Array<{ id: Id }>>`
      insert into pipelines (workspace_id, name, sort) values (${ctx.ws.id}, ${input.name.trim()}, ${count * 10}) returning id`;
    const stages: Array<{ name: string; kind: Stage["kind"]; color: StageColor; sort: number }> = [
      { name: input.stageNames.incoming, kind: "incoming", color: 8, sort: 10 },
      ...input.stageNames.open.map((name, index) => ({ name, kind: "open" as const, color: PALETTE[index % PALETTE.length], sort: 20 + index * 10 })),
      { name: input.stageNames.won, kind: "won", color: 4, sort: 10000 },
      { name: input.stageNames.lost, kind: "lost", color: 6, sort: 11000 },
    ];
    for (const stage of stages) {
      await sql`
        insert into stages (workspace_id, pipeline_id, name, kind, color, sort)
        values (${ctx.ws.id}, ${pipeline.id}, ${stage.name}, ${stage.kind}, ${stage.color}, ${stage.sort})`;
    }
    return loadPipeline(ctx, pipeline.id);
  });
}

export function updatePipeline(ws: string, pipelineId: Id, input: { name?: string; incomingEnabled?: boolean }): Promise<Pipeline> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const pipeline = await loadPipeline(ctx, pipelineId);
    await ctx.sql`
      update pipelines set
        name = ${input.name !== undefined ? input.name.trim() : pipeline.name},
        incoming_enabled = ${input.incomingEnabled ?? pipeline.incomingEnabled}
      where id = ${pipeline.id}`;
    return loadPipeline(ctx, pipeline.id);
  });
}

export function createStage(ws: string, pipelineId: Id, input: { name: string; color: StageColor }): Promise<Stage> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const pipeline = await loadPipeline(ctx, pipelineId);
    if (pipeline.stages.length >= MAX_STAGES) throw new DataError(422, "stage_limit");
    const last = openStages(pipeline).at(-1);
    const [stage] = await ctx.sql<Array<{ id: Id }>>`
      insert into stages (workspace_id, pipeline_id, name, kind, color, sort)
      values (${ctx.ws.id}, ${pipeline.id}, ${input.name.trim()}, 'open', ${input.color}, ${(last?.sort ?? 10) + 10})
      returning id`;
    return findStage(ctx, stage.id);
  });
}

export function updateStage(ws: string, stageId: Id, input: { name?: string; color?: StageColor }): Promise<Stage> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const stage = await findStage(ctx, stageId);
    // Gelen talepler aşaması yeniden adlandırılamaz; kazanıldı ve kaybedildi adlandırılabilir.
    if (stage.kind === "incoming" && input.name !== undefined) throw new DataError(422, "system_stage");
    await ctx.sql`
      update stages set name = ${input.name !== undefined ? input.name.trim() : stage.name}, color = ${input.color ?? stage.color}
      where id = ${stage.id}`;
    return findStage(ctx, stage.id);
  });
}

/** Açık aşamaların sırasını değiştirir. Sistem aşamaları yerinde kalır. */
export function reorderStages(ws: string, pipelineId: Id, orderedIds: Id[]): Promise<Pipeline> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const pipeline = await loadPipeline(ctx, pipelineId);
    const open = openStages(pipeline);
    const same = orderedIds.length === open.length && open.every((stage) => orderedIds.includes(stage.id));
    if (!same) throw new DataError(422, "invalid_order");
    for (const [index, id] of orderedIds.entries()) {
      await ctx.sql`update stages set sort = ${20 + index * 10} where id = ${id} and pipeline_id = ${pipeline.id}`;
    }
    return loadPipeline(ctx, pipeline.id);
  });
}

/**
 * Açık bir aşamayı siler. Aşamada lead varsa moveTo zorunludur; lead'ler oraya taşınır.
 * Sistem aşamaları ve pipeline'ın son açık aşaması silinemez.
 */
export function deleteStage(ws: string, stageId: Id, moveTo?: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    const { sql } = ctx;
    requireAdmin(ctx);
    const stage = await findStage(ctx, stageId);
    if (stage.kind !== "open") throw new DataError(422, "system_stage");
    const pipeline = await loadPipeline(ctx, stage.pipelineId);
    if (openStages(pipeline).length <= 1) throw new DataError(422, "last_stage");

    const live = await sql<Array<{ id: Id }>>`select id from leads where stage_id = ${stage.id} and deleted_at is null for update`;
    let target: Stage;
    if (live.length > 0) {
      if (!moveTo) throw new DataError(409, "stage_not_empty");
      target = await findStage(ctx, moveTo);
      if (target.pipelineId !== pipeline.id || target.kind !== "open" || target.id === stage.id) {
        throw new DataError(422, "invalid_stage", "move target must be another open stage of the same pipeline");
      }
    } else {
      // Çöp kutusundaki lead'ler silinen aşamada kalamaz; ilk açık aşamaya alınır.
      target = openStages(pipeline).find((item) => item.id !== stage.id)!;
    }
    await sql`update leads set stage_id = ${target.id}, updated_by = ${ctx.user.id} where stage_id = ${stage.id}`;
    for (const lead of live) await logEvent(ctx, { leadId: lead.id, type: "stage_changed", from: stage.name, to: target.name });
    await sql`delete from stages where id = ${stage.id}`;
  });
}

/* ---------- kayıp nedenleri (yalnız yönetici yazar) ---------- */

export function createLossReason(ws: string, input: { name: string }): Promise<LossReason> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    const [{ sort }] = await ctx.sql<Array<{ sort: number }>>`select coalesce(max(sort), 0) + 10 as sort from loss_reasons where workspace_id = ${ctx.ws.id}`;
    const [reason] = await ctx.sql<LossReason[]>`
      insert into loss_reasons (workspace_id, name, sort) values (${ctx.ws.id}, ${input.name.trim()}, ${sort}) returning id, name`;
    return { ...reason };
  });
}

export function updateLossReason(ws: string, reasonId: Id, input: { name: string }): Promise<LossReason> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(reasonId)) throw notFound("loss reason");
    const [reason] = await ctx.sql<LossReason[]>`
      update loss_reasons set name = ${input.name.trim()} where id = ${reasonId} and workspace_id = ${ctx.ws.id} returning id, name`;
    if (!reason) throw notFound("loss reason");
    return { ...reason };
  });
}

/** Nedeni siler. Bu nedenle kaybedilmiş lead'ler durur; nedenleri boşalır. */
export function deleteLossReason(ws: string, reasonId: Id): Promise<void> {
  return inWorkspace(ws, async (ctx) => {
    requireAdmin(ctx);
    if (!isUuid(reasonId)) throw notFound("loss reason");
    const deleted = await ctx.sql`delete from loss_reasons where id = ${reasonId} and workspace_id = ${ctx.ws.id} returning id`;
    if (deleted.length === 0) throw notFound("loss reason");
  });
}
