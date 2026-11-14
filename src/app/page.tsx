import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { fill } from "@/i18n/fill";
import { tr } from "@/i18n/tr";

export const metadata: Metadata = {
  title: fill(tr.landing.metaTitle, { name: tr.app.name }),
  description: tr.landing.metaDescription,
};

export default function Page() {
  return <LandingPage />;
}
