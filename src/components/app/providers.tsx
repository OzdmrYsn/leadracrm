"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/i18n";
import { tr } from "@/i18n/tr";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <I18nProvider locale="tr" messages={tr}>
        {children}
      </I18nProvider>
    </QueryClientProvider>
  );
}
