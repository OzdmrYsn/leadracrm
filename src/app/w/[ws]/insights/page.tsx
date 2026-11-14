import { Suspense } from "react";
import { InsightsScreen } from "@/features/insights/insights-screen";

export default function Page({ params }: PageProps<"/w/[ws]/insights">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <InsightsScreen ws={ws} />)}</Suspense>;
}
