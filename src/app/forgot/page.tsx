import type { Metadata } from "next";
import { AuthFrame, AuthSwitch } from "@/features/auth/auth-frame";
import { ForgotForm } from "@/features/auth/forms";
import { tr } from "@/i18n/tr";
import { isProduction } from "@/server/auth";

export const metadata: Metadata = { title: `${tr.auth.forgotTitle} · ${tr.app.name}` };

export default function Page() {
  return (
    <AuthFrame title={tr.auth.forgotTitle} body={tr.auth.forgotBody} devMode={!isProduction()} footer={<AuthSwitch href="/login" label={tr.auth.backToLogin} />}>
      <ForgotForm />
    </AuthFrame>
  );
}
