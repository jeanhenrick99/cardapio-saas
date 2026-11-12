import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Brand } from '@/components/ui/Brand';
import { getMe } from '@/lib/server-api';
import { LoginForm } from './LoginForm';

/**
 * Tela de entrada do sistema (página inicial e /login): quem já está logado vai direto
 * para a sua área (admin, retaguarda ou PDV); os demais entram com usuário e senha.
 */
export async function LoginScreen() {
  if (await getMe()) redirect('/painel');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-10">
      <div className="text-center">
        <h1>
          <Brand size="lg" />
        </h1>
        <div className="mx-auto my-4 h-px w-12 bg-gold" />
        <p className="text-sm tracking-[0.25em] text-gold-soft uppercase">Sistema para restaurantes</p>
        <p className="mt-3 text-muted">Entre com o usuário e a senha cadastrados pelo seu restaurante.</p>
      </div>
      <LoginForm />
      <Link href="/r/demo?mesa=7" className="text-sm text-muted underline-offset-4 hover:text-gold hover:underline">
        Ver o cardápio de demonstração (como cliente da mesa 7)
      </Link>
    </main>
  );
}
