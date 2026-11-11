import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/panel/LoginForm';
import { getMe } from '@/lib/server-api';

export const metadata: Metadata = { title: 'Entrar no painel' };

export default async function LoginPage() {
  if (await getMe()) redirect('/painel');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <div className="mx-auto mb-4 h-px w-12 bg-gold" />
        <h1 className="font-display text-3xl font-semibold">Painel do restaurante</h1>
        <p className="mt-2 text-muted">Pedidos, loja e impressoras em um só lugar.</p>
      </div>
      <LoginForm />
      <Link href="/" className="text-sm text-muted hover:text-gold">
        ← Voltar ao início
      </Link>
    </main>
  );
}
