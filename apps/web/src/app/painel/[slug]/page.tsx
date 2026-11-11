import type { Metadata } from 'next';
import { Dashboard } from '@/components/panel/Dashboard';

export const metadata: Metadata = { title: 'Início' };

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Dashboard slug={slug} />;
}
