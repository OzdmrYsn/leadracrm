import { isProduction } from "@/server/auth";
import { fakeGoogle } from "@/server/google/fake";
import { handle } from "@/server/http";

// Yalnız geliştirme: Google taklidi. Üretimde ve gerçek Google anahtarı tanımlıyken kapalıdır.
async function serve(request: Request, ctx: RouteContext<"/api/dev/google/[...path]">) {
  return handle(async () => {
    if (isProduction() || process.env.GOOGLE_CLIENT_ID) return new Response(null, { status: 404 });
    const { path } = await ctx.params;
    return fakeGoogle(request, path);
  });
}

export const GET = serve;
export const POST = serve;
