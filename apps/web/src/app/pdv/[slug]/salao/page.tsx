import type { Metadata } from 'next';
import { TabsBoard } from '@/components/pdv/TabsBoard';

export const metadata: Metadata = { title: 'Mesas e comandas · PDV' };

export default async function SalaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TabsBoard slug={slug} />;
}
