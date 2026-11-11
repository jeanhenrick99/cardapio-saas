import type { Metadata } from 'next';
import { DeliveryBoard } from '@/components/panel/DeliveryBoard';

export const metadata: Metadata = { title: 'Delivery e balcão · PDV' };

export default async function DeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DeliveryBoard slug={slug} />;
}
