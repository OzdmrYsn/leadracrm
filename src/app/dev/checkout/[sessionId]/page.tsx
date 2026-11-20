import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DevCheckout } from "@/features/settings/dev-checkout";

// Yalnız geliştirme: ödeme sağlayıcısı taklidinin ödeme sayfası. Üretimde yoktur.
export default function Page({ params }: PageProps<"/dev/checkout/[sessionId]">) {
  if (process.env.NODE_ENV === "production") notFound();
  return <Suspense fallback={null}>{params.then(({ sessionId }) => <DevCheckout sessionId={sessionId} />)}</Suspense>;
}
