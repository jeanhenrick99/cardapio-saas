import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';

/** /pdv sem restaurante: leva ao PDV do primeiro restaurante do usuário. */
export default async function PdvIndex() {
  const me = await getMe();
  if (!me) redirect('/login');
  const first = me.restaurants[0];
  redirect(first ? `/pdv/${first.slug}` : '/painel');
}
