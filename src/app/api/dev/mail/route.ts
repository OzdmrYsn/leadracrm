import { isProduction } from "@/server/env";
import { devOutbox, mailerSandbox } from "@/server/mail";

// Yalnız geliştirme: gerçek posta yerine belleğe düşen iletiler. Testler bağlantıları buradan okur. Üretimde 404.
export async function GET() {
  if (isProduction() || !mailerSandbox()) return new Response(null, { status: 404 });
  return Response.json(devOutbox());
}
