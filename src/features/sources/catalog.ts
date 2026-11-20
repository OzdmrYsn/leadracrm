import {
  AtSign,
  Braces,
  Camera,
  ClipboardList,
  FileSpreadsheet,
  MessageCircle,
  MessageSquareText,
  MessagesSquare,
  Music2,
  PhoneCall,
  Send,
  Sheet,
  Smartphone,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ChannelKind, Intake, IntakeProvider } from "@/lib/types";
import { BRAND_MARKS, type BrandMark } from "./brand-marks";

/** Katalogdaki her kaynağın kimliği. Lead alma kapısı açanlar aynı zamanda `IntakeProvider` değeridir. */
export type SourceId = IntakeProvider | "csv" | "whatsapp" | "instagram" | "messenger" | "telegram" | "tiktok" | "viber" | "email" | "sms" | "site_chat";

export type SourceAction =
  /** Gizli adresli bir lead alma kapısı açar. */
  | { type: "intake"; kind: Intake["kind"]; provider: IntakeProvider }
  /** Mesajlaşma kanalı: yönetici kendi anahtarını girer; mesajlar gelen kutusuna, yeni kişiler panoya düşer. */
  | { type: "channel"; kind: ChannelKind }
  /** Lead'ler ekranındaki dosyadan aktarma penceresini açar. */
  | { type: "import" }
  /** Henüz bağlanamaz: sağlayıcının resmî bağlantısı kurulunca açılacak. */
  | { type: "planned" };

export type SourceDef = {
  id: SourceId;
  /** Genel simge: markası olmayan kaynaklarda ve işaret bulunamazsa kullanılır. */
  icon: LucideIcon;
  /**
   * Tanınan markanın tek renk işareti (brand-marks.ts; simple-icons, CC0). Yalnız o hizmete bağlanmayı göstermek
   * için kullanılır; biçimi değiştirilmez. Markalar sahiplerine aittir: yayından önce her birinin kullanım kuralına bakın.
   */
  brand?: BrandMark;
  /**
   * Karonun zemin rengi. Kaynağın herkesçe tanınan rengine yakın, üstündeki beyaz yazıyla en az 4,5:1
   * kontrast veren bir tondur. Bizim paletimizin parçası değildir; bu yüzden token dosyasında değil burada durur.
   */
  tint: string;
  action: SourceAction;
};

const intake = (provider: IntakeProvider, kind: Intake["kind"] = "generic"): SourceAction => ({ type: "intake", kind, provider });

/** Bugün bağlanabilenler. Sıra ekrandaki sıradır: en çok istenen başta. */
export const READY_SOURCES: SourceDef[] = [
  { id: "google_sheets", brand: BRAND_MARKS.google_sheets, icon: Sheet, tint: "#1A7F3C", action: intake("google_sheets", "google_sheets") },
  { id: "google_forms", brand: BRAND_MARKS.google_forms, icon: ClipboardList, tint: "#6B3FC4", action: intake("google_forms", "google_sheets") },
  { id: "telegram", brand: BRAND_MARKS.telegram, icon: Send, tint: "#1877B8", action: { type: "channel", kind: "telegram" } },
  { id: "generic", icon: Braces, tint: "#0B6470", action: intake("generic") },
  { id: "zapier", brand: BRAND_MARKS.zapier, icon: Zap, tint: "#C2410C", action: intake("zapier") },
  { id: "make", brand: BRAND_MARKS.make, icon: Workflow, tint: "#6D00CC", action: intake("make") },
  { id: "n8n", brand: BRAND_MARKS.n8n, icon: Workflow, tint: "#C22D55", action: intake("n8n") },
  { id: "csv", icon: FileSpreadsheet, tint: "#3D4B5C", action: { type: "import" } },
];

/** Mesajlaşma kanalları: her biri sağlayıcının resmî bağlantısını ve onayını bekler. */
export const PLANNED_SOURCES: SourceDef[] = [
  { id: "whatsapp", brand: BRAND_MARKS.whatsapp, icon: MessageCircle, tint: "#0E7A6B", action: { type: "planned" } },
  { id: "instagram", brand: BRAND_MARKS.instagram, icon: Camera, tint: "#C13584", action: { type: "planned" } },
  { id: "messenger", brand: BRAND_MARKS.messenger, icon: MessagesSquare, tint: "#0B5FE0", action: { type: "planned" } },
  { id: "tiktok", brand: BRAND_MARKS.tiktok, icon: Music2, tint: "#16181D", action: { type: "planned" } },
  { id: "viber", brand: BRAND_MARKS.viber, icon: PhoneCall, tint: "#6A56E8", action: { type: "planned" } },
  { id: "email", icon: AtSign, tint: "#A8322A", action: { type: "planned" } },
  { id: "sms", icon: Smartphone, tint: "#3D4B5C", action: { type: "planned" } },
  { id: "site_chat", icon: MessageSquareText, tint: "#0B6470", action: { type: "planned" } },
];

const byProvider = new Map(READY_SOURCES.filter((source) => source.action.type === "intake").map((source) => [source.id, source]));

/** Bağlı bir kapının katalogdaki karşılığı. Bilinmeyen değer genel adrese düşer. */
export function sourceOf(provider: IntakeProvider): SourceDef {
  return byProvider.get(provider) ?? byProvider.get("generic")!;
}

/** Bağlı bir kanalın katalogdaki karşılığı (simge ve renk için). */
export const CHANNEL_SOURCES: Partial<Record<ChannelKind, SourceDef>> = Object.fromEntries(
  [...READY_SOURCES, ...PLANNED_SOURCES].flatMap((source) => {
    if (source.action.type === "channel") return [[source.action.kind, source]];
    // Henüz bağlanamayan kanalların simgesi de konuşma listesinde kullanılır.
    const kinds: Partial<Record<SourceId, ChannelKind>> = { whatsapp: "whatsapp", instagram: "instagram", messenger: "facebook", tiktok: "tiktok", viber: "viber", sms: "sms", site_chat: "livechat" };
    const kind = kinds[source.id];
    return kind ? [[kind, source]] : [];
  }),
);

