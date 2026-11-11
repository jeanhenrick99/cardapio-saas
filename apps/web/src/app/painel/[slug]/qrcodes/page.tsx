import type { Metadata } from 'next';
import { QrCodeSheet } from '@/components/panel/QrCodeSheet';
import { getMe } from '@/lib/server-api';

export const metadata: Metadata = { title: 'QR Codes das mesas' };

export default async function QrCodesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = (await getMe())?.restaurants.find((r) => r.slug === slug);
  return <QrCodeSheet slug={slug} restaurantName={restaurant?.name ?? slug} />;
}
