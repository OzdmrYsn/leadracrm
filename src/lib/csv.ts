// CSV okuma ve yazma. İçe aktarma tarayıcıda okur, dışa aktarma sunucuda yazar; ikisi de buradaki kuralları kullanır.

export type Delimiter = "," | ";" | "\t";

/** Ayırıcıyı ilk satırdan tahmin eder: tırnak dışındaki virgül, noktalı virgül ve sekmeler sayılır. Eşitlikte virgül. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char in counts) counts[char as Delimiter] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

/**
 * CSV metnini satırlara ayırır (RFC 4180): tırnaklı hücreler, çift tırnakla kaçış, hücre içinde satır sonu.
 * Baştaki BOM atılır; hücreler kırpılır; tamamen boş satırlar atlanır.
 */
export function parseCsv(input: string, delimiter: Delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell.trim() === "") {
      // Tırnak yalnız hücrenin başında anlam taşır; ortadaki tırnak düz karakterdir.
      cell = "";
      quoted = true;
    } else if (char === delimiter) endCell();
    else if (char === "\n") endRow();
    else if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

// Harf ya da | ! içermeyen, yalnız rakam ve telefon noktalamasından oluşan değerler formül çalıştıramaz.
const HARMLESS = /^[+-]?[\d\s().,/-]*$/;

/**
 * Hücreyi CSV için yazar. Tablo programları = + - @ ile başlayan hücreyi formül sayar; dışarıdan gelen bir
 * müşteri adı böyle başlarsa dosyayı açanın bilgisayarında komut çalıştırabilir (CSV enjeksiyonu). Böyle
 * hücrelerin önüne tek tırnak konur. Telefon ve negatif sayı gibi zararsız değerlere dokunulmaz.
 */
export function csvCell(value: string, delimiter: Delimiter = ","): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text) && !HARMLESS.test(text)) text = `'${text}`;
  return text.includes('"') || text.includes(delimiter) || /[\n\r]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Satırları CSV metnine çevirir. Satır sonu CRLF; başta BOM var (Excel UTF-8'i ancak böyle tanır). */
export function toCsv(rows: string[][], delimiter: Delimiter = ","): string {
  return `﻿${rows.map((row) => row.map((value) => csvCell(value, delimiter)).join(delimiter)).join("\r\n")}\r\n`;
}

/** Dosya baytlarını metne çevirir. UTF-8 değilse Türkçe Windows kodlamasıyla (Excel'in eski "CSV" kaydı) okur. */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

/** Ondalık virgül kullanan dillerde (Türkçe dahil) tablo programları noktalı virgülle ayrılmış dosya bekler. */
export function delimiterFor(locale: string): Delimiter {
  const sample = new Intl.NumberFormat(locale).format(1.5);
  return sample.includes(",") ? ";" : ",";
}
