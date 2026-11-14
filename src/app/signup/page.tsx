import type { Metadata } from "next";
import { AuthFrame, AuthSwitch } from "@/features/auth/auth-frame";
import { SignupForm } from "@/features/auth/forms";
import { tr } from "@/i18n/tr";
import { isProduction } from "@/server/auth";

export const metadata: Metadata = { title: `${tr.auth.signupTitle} · ${tr.app.name}` };

export default function Page() {
  return (
    <AuthFrame title={tr.auth.signupTitle} body={tr.auth.signupBody} devMode={!isProduction()} footer={<AuthSwitch question={tr.auth.haveAccount} href="/login" label={tr.auth.loginLink} />}>
      <SignupForm />
    </AuthFrame>
  );
}
