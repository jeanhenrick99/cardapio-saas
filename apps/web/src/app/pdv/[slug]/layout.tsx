import { notFound, redirect } from 'next/navigation';
import { SupportBanner } from '@/components/panel/SupportBanner';
import { PdvShell } from '@/components/pdv/PdvShell';
import { getMe, getRestaurantAccess, liveUrl } from '@/lib/server-api';

/** PDV: qualquer membro do restaurante (dono ou equipe) ou o suporte da plataforma. */
export default async function PdvLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getMe();
  if (!me) redirect('/login');
  const access = await getRestaurantAccess(slug);
  if (!access) notFound();

  return (
    <PdvShell me={me} slug={slug} restaurantName={access.name} role={access.role} liveUrl={liveUrl()}>
      {access.support && <SupportBanner restaurantName={access.name} />}
      {children}
    </PdvShell>
  );
}
