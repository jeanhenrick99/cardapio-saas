import type { Metadata } from 'next';
import { PdvScreen } from '@/components/panel/PdvScreen';

export const metadata: Metadata = { title: 'Balcão · PDV' };

export default async function BalcaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PdvScreen slug={slug} />;
}
