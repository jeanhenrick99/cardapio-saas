import type { Metadata } from 'next';
import { TabsBoard } from '@/components/pdv/TabsBoard';

export const metadata: Metadata = { title: 'Comandas · PDV' };

export default async function ComandasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TabsBoard slug={slug} kind="COMANDA" />;
}
