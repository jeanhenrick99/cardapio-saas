import Link from 'next/link';

/** Faixa mostrada ao administrador da plataforma quando ele está dentro da base de um cliente. */
export function SupportBanner({ restaurantName }: { restaurantName: string }) {
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-gold-deep/60 bg-gold/10 px-4 py-2.5 text-sm text-gold-soft print:hidden"
    >
      <span>
        <strong>Modo suporte.</strong> Você está na base de <strong>{restaurantName}</strong> como administrador da plataforma. O que você alterar vale
        para o cliente.
      </span>
      <Link href="/admin" className="shrink-0 font-semibold text-gold underline underline-offset-4">
        ← Voltar ao admin
      </Link>
    </div>
  );
}
