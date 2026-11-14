import { Suspense } from "react";
import { SourcesScreen } from "@/features/sources/sources-screen";

export default function Page({ params }: PageProps<"/w/[ws]/sources">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <SourcesScreen ws={ws} />)}</Suspense>;
}
