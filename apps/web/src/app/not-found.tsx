import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">🍽️</div>
      <h1 className="text-xl font-semibold">Restaurante não encontrado</h1>
      <p className="text-stone-600 dark:text-stone-400">Confira o endereço ou escaneie o QR Code de novo.</p>
      <Link href="/" className="text-brand-600 underline">
        Voltar ao início
      </Link>
    </main>
  );
}
