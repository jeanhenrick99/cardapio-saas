import type { Metadata } from 'next';
import { TeamManager } from '@/components/panel/TeamManager';

export const metadata: Metadata = { title: 'Equipe' };

export default async function EquipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TeamManager slug={slug} />;
}
