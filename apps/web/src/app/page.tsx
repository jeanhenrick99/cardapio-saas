import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div className="text-5xl">🍔</div>
      <h1 className="text-3xl font-bold tracking-tight">Cardápio Digital</h1>
      <p className="text-stone-600 dark:text-stone-400">
        O cliente escaneia o QR Code da mesa, monta o pedido pelo celular e ele sai impresso na cozinha na hora.
      </p>
      <Link
        href="/r/demo?mesa=7"
        className="rounded-xl bg-brand-600 px-5 py-3 text-center font-semibold text-white hover:bg-brand-700"
      >
        Abrir cardápio de demonstração (mesa 7)
      </Link>
      <Link href="/r/demo" className="text-center text-sm text-stone-600 underline dark:text-stone-400">
        ou pedir para retirada / delivery
      </Link>
    </main>
  );
}
