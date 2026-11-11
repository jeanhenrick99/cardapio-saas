import { notFound, redirect } from 'next/navigation';
import { PdvShell } from '@/components/pdv/PdvShell';
import { getMe, liveUrl } from '@/lib/server-api';

/** PDV: qualquer membro do restaurante (dono ou equipe). */
export default async function PdvLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getMe();
  if (!me) redirect('/login');
  const membership = me.restaurants.find((r) => r.slug === slug);
  if (!membership) notFound();

  return (
    <PdvShell me={me} slug={slug} restaurantName={membership.name} role={membership.role} liveUrl={liveUrl()}>
      {children}
    </PdvShell>
  );
}
