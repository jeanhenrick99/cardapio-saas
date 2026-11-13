import type { Metadata } from 'next';
import { PrintersPanel } from '@/components/panel/PrintersPanel';
import { getRestaurantAccess } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Impressoras' };

export default async function PrintersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = (await getRestaurantAccess(slug))?.role ?? 'STAFF';
  return <PrintersPanel slug={slug} role={role} />;
}
