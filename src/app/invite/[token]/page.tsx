import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthFrame } from "@/features/auth/auth-frame";
import { InviteForm } from "@/features/auth/link-forms";
import { tr } from "@/i18n/tr";

export const metadata: Metadata = { title: `${tr.auth.inviteTitle} · ${tr.app.name}` };

export default function Page({ params }: PageProps<"/invite/[token]">) {
  return (
    <AuthFrame title={tr.auth.inviteTitle} body={tr.auth.inviteBody} devMode={false}>
      <Suspense fallback={null}>{params.then(({ token }) => <InviteForm token={token} />)}</Suspense>
    </AuthFrame>
  );
}
