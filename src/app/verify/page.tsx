import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthFrame } from "@/features/auth/auth-frame";
import { VerifyPanel } from "@/features/auth/link-forms";
import { tr } from "@/i18n/tr";

export const metadata: Metadata = { title: `${tr.auth.verifyTitle} · ${tr.app.name}` };

const one = (value: string | string[] | undefined) => (typeof value === "string" && value !== "" ? value : null);

export default function Page({ searchParams }: PageProps<"/verify">) {
  return (
    <AuthFrame title={tr.auth.verifyTitle} body={tr.auth.verifyBody} devMode={false}>
      <Suspense fallback={null}>{searchParams.then((query) => <VerifyPanel token={one(query.token)} />)}</Suspense>
    </AuthFrame>
  );
}
