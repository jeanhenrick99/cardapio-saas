import type { Metadata } from 'next';
import { OrdersBoard } from '@/components/panel/OrdersBoard';

export const metadata: Metadata = { title: 'Pedidos' };

export default async function OrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <OrdersBoard slug={slug} />;
}
