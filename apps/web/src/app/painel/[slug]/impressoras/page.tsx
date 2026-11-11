import type { Metadata } from 'next';
import { PrintersPanel } from '@/components/panel/PrintersPanel';
import { getMe } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Impressoras' };

export default async function PrintersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = (await getMe())?.restaurants.find((r) => r.slug === slug)?.role ?? 'STAFF';
  return <PrintersPanel slug={slug} role={role} />;
}
