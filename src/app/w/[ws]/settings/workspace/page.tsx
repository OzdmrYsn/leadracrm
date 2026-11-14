import { Suspense } from "react";
import { WorkspaceScreen } from "@/features/settings/workspace-screen";

export default function Page({ params }: PageProps<"/w/[ws]/settings/workspace">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <WorkspaceScreen ws={ws} />)}</Suspense>;
}
