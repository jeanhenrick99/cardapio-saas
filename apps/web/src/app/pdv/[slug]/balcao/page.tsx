import type { Metadata } from 'next';
import { BalcaoScreen } from '@/components/pdv/BalcaoScreen';

export const metadata: Metadata = { title: 'Balcão · PDV' };

export default async function BalcaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BalcaoScreen slug={slug} />;
}
