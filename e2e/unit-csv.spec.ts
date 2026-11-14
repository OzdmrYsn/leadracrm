import { expect, test } from "@playwright/test";
import { csvCell, decodeCsv, delimiterFor, detectDelimiter, parseCsv, toCsv } from "../src/lib/csv";

// Tarayıcı gerektirmeyen birim testleri: CSV okuma, yazma ve güvenli hücre kuralları.
test.describe("F14 CSV okuma ve yazma", () => {
  test("F14-U1 ayırıcı ilk satırdan tahmin edilir; tırnak içindeki ayırıcılar sayılmaz", () => {
    expect(detectDelimiter("Ad,Telefon,E-posta\nAli,1,2")).toBe(",");
    expect(detectDelimiter("Ad;Telefon;E-posta\nAli;1;2")).toBe(";");
    expect(detectDelimiter("Ad\tTelefon\tE-posta")).toBe("\t");
    expect(detectDelimiter('"Ad, Soyad";Telefon;Not')).toBe(";");
    expect(detectDelimiter("TekSütun")).toBe(",");
  });

  test("F14-U2 tırnaklı hücreler, çift tırnak, hücre içinde satır sonu ve ayırıcı doğru okunur", () => {
    const text = 'Ad,Not,Tutar\r\n"Kaya, Elif","İlk satır\nikinci satır","12.500,50"\r\n"3 ""büyük"" masa",,\r\n';
    expect(parseCsv(text)).toEqual([
      ["Ad", "Not", "Tutar"],
      ["Kaya, Elif", "İlk satır\nikinci satır", "12.500,50"],
      ['3 "büyük" masa', "", ""],
    ]);
  });

  test("F14-U3 BOM atılır, hücreler kırpılır, boş satırlar atlanır, eksik hücreli satır korunur", () => {
    expect(parseCsv("﻿Ad;Telefon\n  Ali ; 555 \n\n;\nVeli\n")).toEqual([["Ad", "Telefon"], ["Ali", "555"], ["Veli"]]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("yalnız bir hücre")).toEqual([["yalnız bir hücre"]]);
    // Hücrenin ortasındaki tırnak düz karakterdir.
    expect(parseCsv('5" vida,10')).toEqual([['5" vida', "10"]]);
  });

  test("F14-U4 yazma: ayırıcı, tırnak ve satır sonu içeren hücreler tırnaklanır; okuyunca aynı veri çıkar", () => {
    const rows = [
      ["Lead", "Not"],
      ["Kaya; Elif", 'Dedi ki: "tamam"'],
      ["Çok\nsatırlı", " baştaki boşluk"],
    ];
    const csv = toCsv(rows, ";");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Kaya; Elif";"Dedi ki: ""tamam"""\r\n');
    // Kırpma dışında veri aynı döner.
    expect(parseCsv(csv)).toEqual([rows[0], rows[1], ["Çok\nsatırlı", "baştaki boşluk"]]);
  });

  test("F14-U5 formül gibi başlayan hücrelerin önüne tek tırnak konur; telefon ve sayılara dokunulmaz", () => {
    expect(csvCell("=HYPERLINK(\"http://kotu.test\")")).toBe("\"'=HYPERLINK(\"\"http://kotu.test\"\")\"");
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(csvCell("-2+3+cmd")).toBe("'-2+3+cmd");
    expect(csvCell("\tgizli")).toBe("'\tgizli");
    // Zararsız olanlar olduğu gibi kalır.
    expect(csvCell("+90 555 010 20 30")).toBe("+90 555 010 20 30");
    expect(csvCell("-1250,5")).toBe('"-1250,5"');
    expect(csvCell("-1250,5", ";")).toBe("-1250,5");
    expect(csvCell("Ali = Veli")).toBe("Ali = Veli");
    expect(csvCell("")).toBe("");
  });

  test("F14-U6 kodlama: UTF-8 değilse Türkçe Windows kodlamasıyla okunur", () => {
    const utf8 = new TextEncoder().encode("Şirket;Çağrı\nİğne Ltd;ğüşöçı");
    expect(decodeCsv(utf8.buffer as ArrayBuffer)).toBe("Şirket;Çağrı\nİğne Ltd;ğüşöçı");
    // "Şirket;İş" Windows-1254 baytlarıyla: Ş=0xDE, İ=0xDD, ş=0xFE.
    const legacy = new Uint8Array([0xde, 0x69, 0x72, 0x6b, 0x65, 0x74, 0x3b, 0xdd, 0xfe]);
    expect(decodeCsv(legacy.buffer as ArrayBuffer)).toBe("Şirket;İş");
  });

  test("F14-U7 ondalık virgül kullanan dilde noktalı virgül, diğerlerinde virgül seçilir", () => {
    expect(delimiterFor("tr-TR")).toBe(";");
    expect(delimiterFor("de-DE")).toBe(";");
    expect(delimiterFor("en-US")).toBe(",");
  });
});
