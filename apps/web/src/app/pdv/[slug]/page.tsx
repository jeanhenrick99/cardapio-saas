import { redirect } from 'next/navigation';

export default async function PdvHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/pdv/${slug}/mesas`);
}
