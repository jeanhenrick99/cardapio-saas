import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TabScreen } from '@/components/pdv/TabScreen';

type Params = Promise<{ slug: string; kind: string; number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { kind, number } = await params;
  return { title: `${kind === 'mesa' ? 'Mesa' : 'Comanda'} ${decodeURIComponent(number)} · PDV` };
}

export default async function TabPage({ params }: { params: Params }) {
  const { slug, kind, number } = await params;
  if (kind !== 'mesa' && kind !== 'comanda') notFound();
  return <TabScreen slug={slug} kind={kind} number={decodeURIComponent(number)} />;
}
