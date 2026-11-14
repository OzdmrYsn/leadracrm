import { Suspense } from "react";
import { ContactsScreen } from "@/features/contacts/contacts-screen";

export default function Page({ params }: PageProps<"/w/[ws]/contacts">) {
  return <Suspense fallback={null}>{params.then(({ ws }) => <ContactsScreen ws={ws} />)}</Suspense>;
}
