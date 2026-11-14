import { Suspense } from "react";
import { CompaniesScreen } from "@/features/companies/companies-screen";

export default function Page({ params }: PageProps<"/w/[ws]/companies">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <CompaniesScreen ws={ws} />)}</Suspense>;
}
