import type { Metadata } from "next";
import { AuthFrame, AuthSwitch } from "@/features/auth/auth-frame";
import { LoginForm } from "@/features/auth/forms";
import { tr } from "@/i18n/tr";
import { isProduction } from "@/server/auth";

export const metadata: Metadata = { title: `${tr.auth.loginSubmit} · ${tr.app.name}` };

export default function Page() {
  return (
    <AuthFrame title={tr.auth.loginTitle} body={tr.auth.loginBody} devMode={!isProduction()} footer={<AuthSwitch question={tr.auth.noAccount} href="/signup" label={tr.auth.signupLink} />}>
      <LoginForm />
    </AuthFrame>
  );
}
