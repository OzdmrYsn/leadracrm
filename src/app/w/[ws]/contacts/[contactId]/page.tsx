import { Suspense } from "react";
import { ContactScreen } from "@/features/contacts/contact-screen";

export default function Page({ params }: PageProps<"/w/[ws]/contacts/[contactId]">) {
  return <Suspense fallback={null}>{params.then(({ ws, contactId }) => <ContactScreen ws={ws} contactId={contactId} />)}</Suspense>;
}
