import { Suspense } from "react";
import { UsersScreen } from "@/features/settings/users-screen";

export default function Page({ params }: PageProps<"/w/[ws]/settings/users">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <UsersScreen ws={ws} />)}</Suspense>;
}
