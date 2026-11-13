import { notFound, redirect } from 'next/navigation';
import { PanelShell } from '@/components/panel/PanelShell';
import { SupportBanner } from '@/components/panel/SupportBanner';
import { getMe, getRestaurantAccess, liveUrl } from '@/lib/server-api';

/** Retaguarda: exige login e ser o dono do restaurante (funcionários vão para o PDV) ou o suporte da plataforma. */
export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getMe();
  if (!me) redirect('/login');
  const access = await getRestaurantAccess(slug);
  if (!access) notFound();
  // A retaguarda é só do dono: a equipe trabalha no PDV.
  if (access.role !== 'OWNER') redirect(`/pdv/${slug}`);

  return (
    <PanelShell me={me} slug={slug} restaurantName={access.name} role={access.role} liveUrl={liveUrl()}>
      {access.support && <SupportBanner restaurantName={access.name} />}
      {children}
    </PanelShell>
  );
}
