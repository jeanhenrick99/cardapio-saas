import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-px w-12 bg-gold" />
      <h1 className="font-display text-2xl font-semibold">Restaurante não encontrado</h1>
      <p className="text-muted">Confira o endereço ou escaneie o QR Code de novo.</p>
      <Link href="/" className="text-gold underline-offset-4 hover:underline">
        Voltar ao início
      </Link>
    </main>
  );
}
