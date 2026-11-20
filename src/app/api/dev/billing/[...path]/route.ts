import { z } from "zod";
import { isProduction } from "@/server/auth";
import { devCheckoutSession, devEvent, devSubscription, emitDevBillingEvent, settleDevCheckout } from "@/server/billing/dev-provider";
import { asService } from "@/server/db";
import { devShiftSubscription } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { appOrigin } from "@/server/origin";

// Yalnız geliştirme: ödeme taklidinin sayfası ve testlerin kullandığı denetim ucu. Üretimde 404.
const settleSchema = z.object({ sessionId: z.string().min(1), paid: z.boolean() });
const controlSchema = z.object({
  ws: z.string().min(1),
  action: z.enum(["shift", "fail-payment", "end", "replay", "forge"]),
  trialEndsInDays: z.number().optional(),
  periodEndsInDays: z.number().optional(),
  /** replay için: hangi olay yeniden gönderilsin (0 ilk; verilmezse son). */
  index: z.number().int().optional(),
});

async function serve(request: Request, ctx: RouteContext<"/api/dev/billing/[...path]">) {
  return handle(async () => {
    if (isProduction()) return new Response(null, { status: 404 });
    const { path } = await ctx.params;
    const origin = appOrigin(request);

    if (path[0] === "session" && path[1] && request.method === "GET") {
      const session = devCheckoutSession(path[1]);
      if (!session) return new Response(null, { status: 404 });
      const { seats, period, amountMinor, currency, status } = session;
      return Response.json({ seats, period, amountMinor, currency, status });
    }
    if (path[0] === "settle" && request.method === "POST") {
      const input = await readBody(request, settleSchema);
      const result = await settleDevCheckout(input.sessionId, input.paid, origin);
      if (!result) return new Response(null, { status: 409 });
      return Response.json(result);
    }
    if (path[0] === "control" && request.method === "POST") {
      const input = await readBody(request, controlSchema);
      const workspaceId = await asService(async (sql) => (await sql<Array<{ id: string }>>`select id from workspaces where slug = ${input.ws}`)[0]?.id ?? null);
      if (!workspaceId) return new Response(null, { status: 404 });
      if (input.action === "shift") {
        await devShiftSubscription(input.ws, input);
        return Response.json({ ok: true });
      }
      if (input.action === "fail-payment") return Response.json({ status: await emitDevBillingEvent(origin, { type: "payment.failed", workspaceId }) });
      if (input.action === "end") return Response.json({ status: await emitDevBillingEvent(origin, { type: "subscription.canceled", workspaceId }) });
      // Aynı olayı ikinci kez gönderir (sağlayıcının yeniden denemesi).
      if (input.action === "replay") {
        const event = devEvent(input.index);
        return Response.json({ status: event ? await emitDevBillingEvent(origin, event) : 0 });
      }
      // İmzası tutmayan bir bildirim: reddedilmelidir.
      const sub = devSubscription(workspaceId);
      return Response.json({ status: await emitDevBillingEvent(origin, { type: "subscription.activated", workspaceId, seats: 500, period: "year", subscriptionId: sub?.id ?? "sub_sahte", currentPeriodEnd: new Date(Date.now() + 9e10).toISOString() }, { signature: "sahte-imza" }) });
    }
    return new Response(null, { status: 404 });
  });
}

export const GET = serve;
export const POST = serve;
