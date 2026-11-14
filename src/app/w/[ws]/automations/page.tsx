import { Suspense } from "react";
import { AutomationsScreen } from "@/features/automations/automations-screen";

export default function Page({ params }: PageProps<"/w/[ws]/automations">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <AutomationsScreen ws={ws} />)}</Suspense>;
}
