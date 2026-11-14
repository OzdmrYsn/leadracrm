import { Suspense } from "react";
import { ProfileScreen } from "@/features/settings/profile-screen";

export default function Page({ params }: PageProps<"/w/[ws]/settings/profile">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <ProfileScreen ws={ws} />)}</Suspense>;
}
