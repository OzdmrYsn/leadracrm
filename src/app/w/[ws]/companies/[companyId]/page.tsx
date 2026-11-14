import { Suspense } from "react";
import { CompanyScreen } from "@/features/companies/company-screen";

export default function Page({ params }: PageProps<"/w/[ws]/companies/[companyId]">) {
  return <Suspense fallback={null}>{params.then(({ ws, companyId }) => <CompanyScreen ws={ws} companyId={companyId} />)}</Suspense>;
}
