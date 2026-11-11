import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server-api';

/** Entrada depois do login: leva ao primeiro restaurante do usuário. */
export default async function PanelIndex() {
  const me = await getMe();
  if (!me) redirect('/login');
  const first = me.restaurants[0];
  if (!first) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Nenhum restaurante</h1>
        <p className="text-muted">Sua conta ainda não faz parte de nenhum restaurante.</p>
      </main>
    );
  }
  // Dono entra na retaguarda; funcionário vai direto para o PDV.
  redirect(first.role === 'OWNER' ? `/painel/${first.slug}` : `/pdv/${first.slug}`);
}
