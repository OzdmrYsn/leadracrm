import { z } from "zod";
import type { ApiErrorBody, LeadFilter } from "@/lib/types";
import { DataError } from "./errors";

function errorResponse(status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

/**
 * Rota işleyicisini sarar: veri katmanı ve doğrulama hatalarını tutarlı JSON yanıtına çevirir.
 * Yanıttaki "code" istemcide kullanıcı metnine çevrilir; "message" yalnız geliştirici içindir.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DataError) return errorResponse(error.status, error.code, error.message);
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      return errorResponse(422, "validation", issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid input");
    }
    const known = databaseError(error);
    if (known) return errorResponse(known.status, known.code, known.detail);
    console.error(error);
    return errorResponse(500, "internal", "unexpected error");
  }
}

/**
 * Veri katmanının önceden yakalamadığı veritabanı hatalarını anlamlı yanıtlara çevirir. Bunlar son savunmadır:
 * kurallar önce veri katmanında denetlenir, yarış durumunda veritabanı kısıtı devreye girer.
 */
function databaseError(error: unknown): { status: number; code: string; detail: string } | null {
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string") return null;
  const detail = "message" in error && typeof error.message === "string" ? error.message : "database error";
  switch (error.code) {
    case "22P02": // geçersiz kimlik biçimi
      return { status: 404, code: "not_found", detail };
    case "23505": // tekillik: aynı kayıt bu arada eklendi
      return { status: 409, code: "conflict", detail };
    case "23503": // başka bir kaydın bağlı olduğu ya da olmayan bir kayda bağlanan satır
      return { status: 409, code: "conflict", detail };
    case "23514":
      if (detail.includes("pipeline_limit_reached")) return { status: 422, code: "pipeline_limit", detail };
      if (detail.includes("stage_limit_reached")) return { status: 422, code: "stage_limit", detail };
      if (detail.includes("system_stage") || detail.includes("stage_kind_is_fixed")) return { status: 422, code: "system_stage", detail };
      if (detail.includes("last_admin")) return { status: 422, code: "last_admin", detail };
      return { status: 422, code: "validation", detail };
    case "42501": // satır düzeyi güvenlik reddetti
      return { status: 403, code: "forbidden", detail };
    default:
      return null;
  }
}

/** CSV dosyasını indirme yanıtı olarak döndürür. Dosya adı yalnız ASCII'dir; içerik önbelleğe alınmaz. */
export function csvResponse(file: { filename: string; csv: string }): Response {
  return new Response(file.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** İstek gövdesini okur ve şemayla doğrular. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new DataError(400, "bad_json", "request body is not valid JSON");
  }
  return schema.parse(raw);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Sorgu dizgisinden pano ve liste süzgecini okur. Tanınmayan değerler yok sayılır. */
export function parseLeadFilter(request: Request): LeadFilter {
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");
  return {
    query: params.get("q") ?? undefined,
    responsible: params.get("responsible") ?? undefined,
    tagIds: params.get("tags")?.split(",").filter(Boolean),
    noTask: params.get("noTask") === "1" || undefined,
    unread: params.get("unread") === "1" || undefined,
    stageId: params.get("stage") ?? undefined,
    status: status === "open" || status === "won" || status === "lost" || status === "all" || status === "deleted" ? status : undefined,
    pipelineId: params.get("pipeline") ?? undefined,
    createdFrom: from && DAY.test(from) ? from : undefined,
    createdTo: to && DAY.test(to) ? to : undefined,
  };
}

/** Palet anahtarı: tasarım token'ı --stage-1 … --stage-8. */
export const colorSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]);
