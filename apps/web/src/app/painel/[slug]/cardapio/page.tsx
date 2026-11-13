import type { Metadata } from 'next';
import { MenuEditor } from '@/components/panel/MenuEditor';
import { getRestaurantAccess } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Cardápio' };

export default async function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = (await getRestaurantAccess(slug))?.role ?? 'STAFF';
  return <MenuEditor slug={slug} role={role} />;
}
