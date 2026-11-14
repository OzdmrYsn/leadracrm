import { Suspense } from "react";
import { CalendarScreen } from "@/features/tasks/calendar-screen";

export default function Page({ params }: PageProps<"/w/[ws]/calendar">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <CalendarScreen ws={ws} />)}</Suspense>;
}
