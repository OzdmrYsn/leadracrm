import { tr } from "@/i18n/tr";

/**
 * Google Sheets'e yapıştırılan Apps Script kodu: tabloya eklenen her yeni satırı lead alma kapısına gönderir.
 * Kod müşterinin kendi tablosunda, kendi Google hesabıyla çalışır; bizim tarafımızda Google izni gerekmez.
 * Satır numarası dış kimliğe girer: aynı satır yeniden gönderilse de ikinci lead açılmaz.
 */
export function sheetsScript(url: string): string {
  return `/**
 * ${tr.app.name} bağlantısı: bu tablonun ilk sayfasına eklenen her yeni satırı lead olarak gönderir.
 * Kurulum: "kur" işlevini bir kez çalıştırın ve istenen izni verin.
 */
const ADRES = ${JSON.stringify(url)};

function kur() {
  const tablo = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (tetik) {
    if (tetik.getHandlerFunction() === "yeniSatirlariGonder") ScriptApp.deleteTrigger(tetik);
  });
  ScriptApp.newTrigger("yeniSatirlariGonder").forSpreadsheet(tablo).onChange().create();
  ScriptApp.newTrigger("yeniSatirlariGonder").timeBased().everyMinutes(5).create();
  // Var olan satırlar gönderilmez: yalnız bundan sonra eklenenler.
  PropertiesService.getDocumentProperties().setProperty("sonSatir", String(tablo.getSheets()[0].getLastRow()));
}

function yeniSatirlariGonder() {
  const kilit = LockService.getDocumentLock();
  if (!kilit.tryLock(1000)) return;
  try {
    const tablo = SpreadsheetApp.getActive();
    const sayfa = tablo.getSheets()[0];
    const ozellikler = PropertiesService.getDocumentProperties();
    const son = Number(ozellikler.getProperty("sonSatir") || 1);
    const sonDolu = sayfa.getLastRow();
    if (sonDolu <= son) return;
    const sutun = sayfa.getLastColumn();
    const basliklar = sayfa.getRange(1, 1, 1, sutun).getDisplayValues()[0];
    const satirlar = sayfa.getRange(son + 1, 1, sonDolu - son, sutun).getDisplayValues();
    for (let i = 0; i < satirlar.length; i++) {
      const satirNo = son + 1 + i;
      const degerler = {};
      let dolu = false;
      basliklar.forEach(function (baslik, k) {
        if (baslik && satirlar[i][k] !== "") {
          degerler[baslik] = satirlar[i][k];
          dolu = true;
        }
      });
      if (!dolu) break; // ilk boş satırda dur
      const yanit = UrlFetchApp.fetch(ADRES, {
        method: "post",
        contentType: "application/json",
        muteHttpExceptions: true,
        payload: JSON.stringify({ externalId: tablo.getId() + ":" + sayfa.getSheetId() + ":" + satirNo, values: degerler }),
      });
      const kod = yanit.getResponseCode();
      if (kod !== 200 && kod !== 201) {
        console.error("Satır " + satirNo + " gönderilemedi: " + kod + " " + yanit.getContentText());
        break; // sonraki çalışmada aynı satırdan yeniden denenir
      }
      ozellikler.setProperty("sonSatir", String(satirNo));
    }
  } finally {
    kilit.releaseLock();
  }
}
`;
}

/** Genel adres için örnek gövde. */
export const exampleBody = JSON.stringify(
  { externalId: "form-2026-0001", values: { "Ad Soyad": "Örnek Müşteri", Telefon: "+90 555 000 00 00", "E-posta": "ornek@ornek.test", Tutar: "12.500", Not: "Mutfak dolabı" } },
  null,
  2,
);

/** Zapier, Make ve n8n gibi araçlar için düz örnek gövde: alan adı → değer. */
export const flatExampleBody = JSON.stringify({ "Ad Soyad": "Örnek Müşteri", Telefon: "+90 555 000 00 00", "E-posta": "ornek@ornek.test", Tutar: "12.500", Not: "Mutfak dolabı" }, null, 2);
