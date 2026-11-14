import { ApiError } from "./api";
import type { ApiErrorBody } from "./types";

/**
 * Sunucudaki bir dosyayı indirir ve dosya adını döndürür. Düz bağlantı yerine fetch kullanılır:
 * sunucu reddederse (yetki yok gibi) hata ekranda gösterilebilsin, kullanıcı boş bir sayfaya düşmesin.
 */
export async function downloadFile(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    let code = "unknown";
    let message = response.statusText;
    try {
      const parsed = (await response.json()) as ApiErrorBody;
      code = parsed.error.code;
      message = parsed.error.message;
    } catch {
      // Gövde JSON değilse durum metni yeterli.
    }
    throw new ApiError(response.status, code, message);
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "export.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Tarayıcı indirmeyi başlattıktan sonra bellekteki kopya bırakılır.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
