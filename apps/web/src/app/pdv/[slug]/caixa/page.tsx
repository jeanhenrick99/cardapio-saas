import type { Metadata } from 'next';
import { CashScreen } from '@/components/pdv/CashScreen';

export const metadata: Metadata = { title: 'Caixa · PDV' };

export default async function CaixaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CashScreen slug={slug} />;
}
