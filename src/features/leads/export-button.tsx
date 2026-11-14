"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fill, useI18n } from "@/i18n";
import { downloadFile } from "@/lib/download";
import { errorText } from "@/lib/errors";

/** Dışa aktarmayı başlatır ve sonucu bildirir. Ekran, sonucu kendi bildirim alanında gösterir. */
export function useExport(onResult: (result: { text: string; warning: boolean }) => void) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  async function run(path: string) {
    setPending(true);
    try {
      onResult({ text: fill(t.transfer.exported, { name: await downloadFile(path) }), warning: false });
    } catch (error) {
      onResult({ text: fill(t.transfer.exportFailed, { reason: errorText(error, t) }), warning: true });
    } finally {
      setPending(false);
    }
  }
  return { run, pending };
}

/** Liste ekranlarındaki "Dışa aktar" düğmesi. */
export function ExportButton({ path, onResult }: { path: string; onResult: (result: { text: string; warning: boolean }) => void }) {
  const { t } = useI18n();
  const exporter = useExport(onResult);
  return (
    <Button size="sm" icon={<Download aria-hidden />} loading={exporter.pending} onClick={() => void exporter.run(path)}>
      {t.transfer.exportShort}
    </Button>
  );
}
