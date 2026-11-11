import Link from 'next/link';
import { Brand } from '@/components/ui/Brand';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div className="h-px w-16 bg-gold" />
      <h1>
        <Brand size="lg" />
      </h1>
      <p className="-mt-3 text-sm tracking-[0.3em] text-gold-soft uppercase">Cardápio digital para restaurantes</p>
      <p className="text-muted">
        O cliente escaneia o QR Code da mesa, monta o pedido pelo celular e ele sai impresso na cozinha na hora.
      </p>
      <Link
        href="/r/demo?mesa=7"
        className="rounded-xl bg-wine px-5 py-3 text-center font-semibold text-fg ring-1 ring-gold/30 hover:bg-wine-hover"
      >
        Abrir cardápio de demonstração (mesa 7)
      </Link>
      <Link href="/r/demo" className="text-center text-sm text-gold underline-offset-4 hover:underline">
        ou pedir para retirada / delivery
      </Link>
      <div className="mt-6 border-t border-line pt-6 text-center text-sm text-muted">
        É dono de restaurante?{' '}
        <Link href="/login" className="font-semibold text-gold underline-offset-4 hover:underline">
          Acessar o painel
        </Link>
      </div>
    </main>
  );
}
