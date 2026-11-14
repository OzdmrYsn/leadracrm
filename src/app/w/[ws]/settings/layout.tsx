import { Suspense } from "react";
import { SettingsFrame } from "@/components/app/settings-frame";

export default function SettingsLayout({ children, params }: LayoutProps<"/w/[ws]/settings">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <SettingsFrame ws={ws}>{children}</SettingsFrame>)}</Suspense>;
}
