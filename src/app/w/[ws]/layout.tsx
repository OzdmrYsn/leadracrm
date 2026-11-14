import { Suspense } from "react";
import { Shell } from "@/components/app/shell";

export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[ws]">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <Shell ws={ws}>{children}</Shell>)}</Suspense>;
}
