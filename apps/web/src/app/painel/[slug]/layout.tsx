import { notFound, redirect } from 'next/navigation';
import { PanelShell } from '@/components/panel/PanelShell';
import { getMe, liveUrl } from '@/lib/server-api';

/** Retaguarda: exige login e ser o dono do restaurante (funcionários vão para o PDV). */
export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getMe();
  if (!me) redirect('/login');
  const membership = me.restaurants.find((r) => r.slug === slug);
  if (!membership) notFound();
  // A retaguarda é só do dono: a equipe trabalha no PDV.
  if (membership.role !== 'OWNER') redirect(`/pdv/${slug}`);

  return (
    <PanelShell me={me} slug={slug} restaurantName={membership.name} role={membership.role} liveUrl={liveUrl()}>
      {children}
    </PanelShell>
  );
}
