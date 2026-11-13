import type { Metadata } from 'next';
import { StoreSettingsForm } from '@/components/panel/StoreSettingsForm';
import { getRestaurantAccess } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Loja' };

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = (await getRestaurantAccess(slug))?.role ?? 'STAFF';
  return <StoreSettingsForm slug={slug} role={role} />;
}
