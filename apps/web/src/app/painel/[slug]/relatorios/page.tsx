import type { Metadata } from 'next';
import { SalesReport } from '@/components/panel/SalesReport';

export const metadata: Metadata = { title: 'Relatórios' };

export default async function RelatoriosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SalesReport slug={slug} />;
}
