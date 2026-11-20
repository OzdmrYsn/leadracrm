import type { ChannelKind } from "@/lib/types";
import { telegram } from "./telegram";
import type { ChannelAdapter } from "./types";

// Bağlanabilen kanallar. Listede olmayan tür "sırada"dır.
const adapters: Partial<Record<ChannelKind, ChannelAdapter<never>>> = {
  telegram: telegram as ChannelAdapter<never>,
};

export function adapterFor(kind: ChannelKind): ChannelAdapter | null {
  return (adapters[kind] as ChannelAdapter | undefined) ?? null;
}

export { ChannelError } from "./types";
export type { InboundEvent, SendFailure } from "./types";
