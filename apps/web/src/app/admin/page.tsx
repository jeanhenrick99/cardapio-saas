import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AdminRestaurants } from '@/components/admin/AdminRestaurants';
import { getMe } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Administração', robots: { index: false, follow: false } };

/** Área do administrador da plataforma. Para qualquer outra pessoa, a página não existe (404). */
export default async function AdminPage() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.isPlatformAdmin) notFound();
  return <AdminRestaurants me={me} />;
}
