import { Suspense } from "react";
import { LeadScreen } from "@/features/lead/lead-screen";

export default function Page({ params }: PageProps<"/w/[ws]/leads/[leadId]">) {
  return <Suspense fallback={null}>{params.then(({ ws, leadId }) => <LeadScreen ws={ws} leadId={leadId} />)}</Suspense>;
}
