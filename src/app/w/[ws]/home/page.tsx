import { Suspense } from "react";
import { HomeScreen } from "@/features/home/home-screen";

export default function Page({ params }: PageProps<"/w/[ws]/home">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <HomeScreen ws={ws} />)}</Suspense>;
}
