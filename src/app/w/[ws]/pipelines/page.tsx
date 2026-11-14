import { Suspense } from "react";
import { BoardScreen } from "@/features/board/board-screen";

export default function Page({ params }: PageProps<"/w/[ws]/pipelines">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <BoardScreen ws={ws} />)}</Suspense>;
}
