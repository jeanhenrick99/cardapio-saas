import { redirect } from 'next/navigation';

/** O Kanban de delivery agora fica no PDV. */
export default async function OldDeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/pdv/${(await params).slug}/delivery`);
}
