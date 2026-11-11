import type { Metadata } from 'next';
import { TabsBoard } from '@/components/pdv/TabsBoard';

export const metadata: Metadata = { title: 'Mesas · PDV' };

export default async function MesasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TabsBoard slug={slug} kind="MESA" />;
}
