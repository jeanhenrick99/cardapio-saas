import { notFound, redirect } from 'next/navigation';
import { PanelShell } from '@/components/panel/PanelShell';
import { getMe } from '@/lib/server-api';

/** Protege todas as páginas do painel: exige login e que o usuário seja membro do restaurante. */
export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getMe();
  if (!me) redirect('/login');
  const membership = me.restaurants.find((r) => r.slug === slug);
  if (!membership) notFound();

  return (
    <PanelShell me={me} slug={slug} restaurantName={membership.name} role={membership.role}>
      {children}
    </PanelShell>
  );
}
