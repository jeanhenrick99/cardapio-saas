import type { Metadata } from 'next';
import { PdvScreen } from '@/components/panel/PdvScreen';

export const metadata: Metadata = { title: 'PDV' };

export default async function PdvPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PdvScreen slug={slug} />;
}
