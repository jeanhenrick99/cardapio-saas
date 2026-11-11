import { redirect } from 'next/navigation';

/** O PDV saiu da retaguarda e tem endereço próprio. */
export default async function OldPdvPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/pdv/${(await params).slug}/balcao`);
}
