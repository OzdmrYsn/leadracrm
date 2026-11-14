"use client";

import Link from "next/link";
import { Tag } from "@/components/ui/tag";
import { formatMoney } from "@/lib/format";
import type { LeadSummary, Session } from "@/lib/types";

/** Bir kişiye ya da şirkete bağlı lead'ler: ad, aşama ve tutar. */
export function LeadLinks({ ws, leads, session, emptyText }: { ws: string; leads: LeadSummary[]; session: Session; emptyText: string }) {
  if (leads.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  const stages = new Map(session.pipelines.flatMap((pipeline) => pipeline.stages).map((stage) => [stage.id, stage]));
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {leads.map((lead) => {
        const stage = stages.get(lead.stageId);
        return (
          <li key={lead.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <Link href={`/w/${ws}/leads/${lead.id}`} className="min-w-0 flex-1 truncate rounded-sm text-sm font-medium text-fg underline-offset-4 hover:underline">
              {lead.name}
            </Link>
            {stage ? <Tag color={stage.color}>{stage.name}</Tag> : null}
            {lead.priceMinor > 0 ? (
              <span className="text-sm text-fg tabular-nums">{formatMoney(lead.priceMinor, lead.currency, session.workspace.locale)}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
