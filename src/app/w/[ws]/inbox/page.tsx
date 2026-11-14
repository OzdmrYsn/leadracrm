import { Suspense } from "react";
import { InboxScreen } from "@/features/inbox/inbox-screen";

export default function Page({ params }: PageProps<"/w/[ws]/inbox">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <InboxScreen ws={ws} />)}</Suspense>;
}
