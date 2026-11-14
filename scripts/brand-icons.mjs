// Kaynak kataloğundaki üçüncü taraf markaların tek renk işaretlerini üretir.
// Kaynak: simple-icons (CC0-1.0). Çizim verisi serbesttir; markaların kendisi sahiplerine aittir ve her birinin
// kullanım kuralı vardır (aşağıda "guidelines"). Yayından önce bu kurallara bakın.
// Çalıştır: npm run brand-icons  →  src/features/sources/brand-marks.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as icons from "simple-icons";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "src/features/sources/brand-marks.ts");

// Katalog kimliği → simple-icons adı. Burada olmayan kaynaklar genel simgeyle gösterilir.
const wanted = {
  google_sheets: "siGooglesheets",
  google_forms: "siGoogleforms",
  zapier: "siZapier",
  make: "siMake",
  n8n: "siN8n",
  whatsapp: "siWhatsapp",
  instagram: "siInstagram",
  messenger: "siMessenger",
  telegram: "siTelegram",
  tiktok: "siTiktok",
  viber: "siViber",
};

const lines = [
  "// ÜRETİLEN DOSYA — elle düzenlemeyin. Üretmek için: npm run brand-icons (scripts/brand-icons.mjs).",
  "// Çizimler simple-icons paketinden (CC0-1.0) alınır. Markalar sahiplerine aittir; işaretler yalnız o hizmete",
  "// bağlanmayı göstermek için, biçimi bozulmadan ve tek renk kullanılır.",
  "",
  "export type BrandMark = { title: string; hex: string; path: string; guidelines: string | null };",
  "",
  "export const BRAND_MARKS = {",
];
for (const [id, name] of Object.entries(wanted)) {
  const icon = icons[name];
  if (!icon) throw new Error(`simple-icons içinde yok: ${name}`);
  lines.push(`  ${id}: { title: ${JSON.stringify(icon.title)}, hex: "#${icon.hex}", path: ${JSON.stringify(icon.path)}, guidelines: ${JSON.stringify(icon.guidelines ?? null)} },`);
}
lines.push("} as const satisfies Record<string, BrandMark>;", "");
writeFileSync(target, lines.join("\n"));
console.log(`brand-icons: ${Object.keys(wanted).length} işaret → ${target.replace(root + "/", "")}`);
