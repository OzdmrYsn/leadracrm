// Dışarıdan gelen bir tablonun sütun başlıklarını lead alanlarına eşlemek için bilinen adlar.
// Lead alma kapısı (sunucu) ve içe aktarma penceresi (tarayıcı) aynı listeyi kullanır.
import { fold } from "./text";

export const LEAD_COLUMN_ALIASES = {
  name: ["lead", "lead adı", "konu", "başlık", "talep", "subject", "title", "lead name"],
  contact: ["ad", "isim", "ad soyad", "adı soyadı", "müşteri", "kişi", "kişi adı", "name", "full name", "contact", "contact name"],
  company: ["şirket", "firma", "kurum", "company", "company name", "organization"],
  phone: ["telefon", "tel", "gsm", "cep", "cep telefonu", "phone", "phone number", "mobile"],
  email: ["e-posta", "eposta", "mail", "email", "e-mail"],
  price: ["tutar", "bütçe", "fiyat", "price", "amount", "budget"],
} satisfies Record<string, string[]>;

export type LeadSlot = keyof typeof LEAD_COLUMN_ALIASES;

export const LEAD_SLOTS = Object.keys(LEAD_COLUMN_ALIASES) as LeadSlot[];

/** Başlığın karşılık geldiği lead alanı; büyük-küçük harf ve Türkçe harf ayrımı olmadan. Tanınmıyorsa null. */
export function slotOf(header: string): LeadSlot | null {
  const name = fold(header);
  return LEAD_SLOTS.find((slot) => LEAD_COLUMN_ALIASES[slot].some((item) => fold(item) === name)) ?? null;
}
