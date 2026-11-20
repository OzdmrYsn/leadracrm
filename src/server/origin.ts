/** Uygulamanın dışarıdan görünen adresi: yönlendirme ve bildirim adresleri buna göre kurulur. */
export function appOrigin(request: Request): string {
  return process.env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
}
