import { z } from "zod";
import { authAvailable, clientAddress, startSession } from "@/server/auth";
import { acceptInvitation, DataError } from "@/server/data";
import { handle, readBody } from "@/server/http";
import { allowRequest } from "@/server/rate-limit";

const schema = z.object({ name: z.string().trim().max(120).default(""), password: z.string().min(8).max(200) });

// Daveti kabul eder ve oturumu açar. Hesabı olan davetli kendi şifresini yazar; olmayan yeni şifre belirler.
export async function POST(request: Request, ctx: RouteContext<"/api/invitations/[token]/accept">) {
  return handle(async () => {
    if (!authAvailable()) throw new DataError(503, "auth_unavailable", "sign-in is not configured");
    if (!allowRequest(`invite-accept:${clientAddress(request)}`, 10, 60_000)) throw new DataError(429, "rate_limited", "too many requests");
    const { token } = await ctx.params;
    const accepted = await acceptInvitation(token, await readBody(request, schema));
    await startSession(accepted.userId, request);
    return Response.json({ redirect: `/w/${accepted.slug}/home` });
  });
}
