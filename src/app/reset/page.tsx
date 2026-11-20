import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthFrame, AuthSwitch } from "@/features/auth/auth-frame";
import { ResetForm } from "@/features/auth/link-forms";
import { tr } from "@/i18n/tr";
import { isProduction } from "@/server/env";

export const metadata: Metadata = { title: `${tr.auth.resetTitle} · ${tr.app.name}` };

const one = (value: string | string[] | undefined) => (typeof value === "string" && value !== "" ? value : null);

export default function Page({ searchParams }: PageProps<"/reset">) {
  return (
    <AuthFrame title={tr.auth.resetTitle} body={tr.auth.resetBody} devMode={!isProduction()} footer={<AuthSwitch href="/login" label={tr.auth.backToLogin} />}>
      <Suspense fallback={null}>{searchParams.then((query) => <ResetForm token={one(query.token)} />)}</Suspense>
    </AuthFrame>
  );
}
