import { rotateIntake } from "@/server/data";
import { handle } from "@/server/http";

// Gizli adresi yeniler; eski adres hemen geçersiz olur. Yeni anahtar yalnız bu yanıtta döner.
export async function POST(_request: Request, ctx: RouteContext<"/api/w/[ws]/intakes/[intakeId]/rotate">) {
  return handle(async () => {
    const { ws, intakeId } = await ctx.params;
    return Response.json(await rotateIntake(ws, intakeId));
  });
}
