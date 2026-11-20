import { Suspense } from "react";
import { BillingScreen } from "@/features/settings/billing-screen";

export default function Page({ params }: PageProps<"/w/[ws]/settings/billing">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <BillingScreen ws={ws} />)}</Suspense>;
}
