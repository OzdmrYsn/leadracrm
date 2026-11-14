import { z } from "zod";
import { ingestInboundMessage } from "@/server/data";
import { handle, readBody } from "@/server/http";

// Yalnız geliştirme: bir kanaldan mesaj gelmiş gibi yapar. Gerçek sistemde bunu kanal webhook'u tetikler.
const schema = z.object({
  ws: z.string().min(1),
  externalChatId: z.string().min(1).optional(),
  contactName: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1).optional(),
});

const people = ["Zeynep Aydın", "Kerem Polat", "Aslı Güneş", "Burak Erdem", "Nil Karaca"];
const openers = [
  "Merhaba, çalışma masası için fiyat alabilir miyim?",
  "Selam, kataloğunuzu gönderebilir misiniz?",
  "Merhaba, teslimat ne kadar sürüyor?",
  "İyi günler, ölçüye özel kitaplık yapıyor musunuz?",
];

export async function POST(request: Request) {
  return handle(async () => {
    if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
    const input = await readBody(request, schema);
    const pick = Math.floor(Math.random() * 1000);
    const result = await ingestInboundMessage(input.ws, {
      externalChatId: input.externalChatId ?? `tg-sim-${Date.now()}`,
      contactName: input.contactName ?? people[pick % people.length],
      text: input.text ?? openers[pick % openers.length],
    });
    return Response.json(result, { status: 201 });
  });
}
