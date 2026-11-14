"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Messages } from "./tr";

type I18n = { locale: string; t: Messages };

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: string; messages: Messages; children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, t: messages }}>{children}</I18nContext.Provider>;
}

/** Metin kataloğu ve yerel ayar. */
export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n, I18nProvider içinde kullanılmalı");
  return value;
}

export { fill } from "./fill";
