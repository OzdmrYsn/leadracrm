import { Suspense } from "react";
import { LeadsScreen } from "@/features/leads/leads-screen";

export default function Page({ params }: PageProps<"/w/[ws]/leads">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <LeadsScreen ws={ws} />)}</Suspense>;
}
