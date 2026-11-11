'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatBRL } from '@cardapio/shared';
import { useLiveEvents, usePollingInterval } from '@/lib/live';
import { timeAgo, waitingLevel } from '@/lib/panel';
import type { TabsResponse, TabSummary } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { inputClass, primaryButton } from '../panel/styles';

const grid = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8';

/** Salão: grade de mesas (1..N do cadastro) e comandas abertas na mesma tela, mais as contas fechadas recentes. */
export function TabsBoard({ slug }: { slug: string }) {
  const router = useRouter();
  const { data, refresh } = usePolling<TabsResponse>(`/restaurants/${slug}/tabs`, usePollingInterval());
  const [comanda, setComanda] = useState('');
  useLiveEvents((e) => (e.type === 'tabs_changed' || e.type === 'order_status') && void refresh());

  const path = (kind: 'mesa' | 'comanda', number: string) => `/pdv/${slug}/conta/${kind}/${encodeURIComponent(number)}`;
  const open = data?.open ?? [];
  const mesas = open.filter((t) => t.kind === 'MESA');
  const comandas = open.filter((t) => t.kind === 'COMANDA');
  const mesaByNumber = new Map(mesas.map((t) => [t.number, t]));
  const tableCount = data?.tableCount ?? 0;

  // 1..N do cadastro + qualquer mesa aberta fora dessa faixa (ex.: mesa 30 aberta pelo QR Code).
  const mesaNumbers = [
    ...Array.from({ length: tableCount }, (_, i) => String(i + 1)),
    ...mesas.map((t) => t.number).filter((n) => !(Number(n) >= 1 && Number(n) <= tableCount)),
  ];
  const total = open.reduce((s, t) => s + t.consumedCents, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold">Mesas e comandas</h1>
        <p className="text-sm text-muted">
          {mesas.length} mesa(s) ocupada(s) · {comandas.length} comanda(s) aberta(s) · {formatBRL(total)} em consumo
        </p>
      </div>

      <section aria-label="Mesas" className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-gold-soft uppercase">Mesas</h2>
        {data && mesaNumbers.length === 0 && (
          <p className="rounded-2xl p-6 text-center text-muted ring-1 ring-line">
            Nenhuma mesa cadastrada. O dono define a quantidade em <strong>Retaguarda → Loja</strong>.
          </p>
        )}
        <ul className={grid}>
          {mesaNumbers.map((n) => (
            <li key={n}>
              <TabTile href={path('mesa', n)} label={n} tab={mesaByNumber.get(n)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Comandas" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-gold-soft uppercase">Comandas</h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = comanda.trim();
              if (n) router.push(path('comanda', n));
            }}
          >
            <input
              aria-label="Número da comanda"
              value={comanda}
              onChange={(e) => setComanda(e.target.value)}
              placeholder="Nº da comanda"
              maxLength={20}
              className={`${inputClass} w-40 py-2`}
            />
            <button type="submit" className={`${primaryButton} py-2`}>
              Abrir
            </button>
          </form>
        </div>
        {data && comandas.length === 0 && <p className="text-sm text-muted">Nenhuma comanda aberta. Digite o número do cartão para abrir.</p>}
        <ul className={grid}>
          {comandas.map((t) => (
            <li key={t.id}>
              <TabTile href={path('comanda', t.number)} label={t.number} tab={t} />
            </li>
          ))}
        </ul>
      </section>

      {data && data.closed.length > 0 && (
        <section aria-label="Fechadas recentemente">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-gold-soft uppercase">Fechadas nas últimas 12 h</h2>
          <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
            {data.closed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="font-display text-lg font-semibold">
                  {t.kind === 'MESA' ? 'Mesa' : 'Comanda'} {t.number}
                </span>
                <span className="text-muted">
                  fechada {t.closedAt ? timeAgo(t.closedAt) : ''}
                  {t.closedBy ? ` por ${t.closedBy}` : ''}
                </span>
                <span className="text-muted">{t.paymentMethod}</span>
                <span className="ml-auto font-semibold text-gold tabular-nums">{formatBRL(t.totalCents ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TabTile({ href, label, tab }: { href: string; label: string; tab?: TabSummary }) {
  if (!tab) {
    return (
      <Link
        href={href}
        className="flex aspect-square flex-col items-center justify-center rounded-2xl text-muted ring-1 ring-line transition hover:text-fg hover:ring-gold-deep"
      >
        <span className="font-display text-3xl font-semibold">{label}</span>
        <span className="text-xs">livre</span>
      </Link>
    );
  }
  const { minutes } = waitingLevel(tab.openedAt);
  return (
    <Link
      href={href}
      className="flex aspect-square flex-col items-center justify-center rounded-2xl bg-wine p-1 text-center ring-1 ring-gold/40 transition hover:bg-wine-hover"
    >
      <span className="font-display text-3xl font-semibold text-fg">{label}</span>
      <span className="text-sm font-semibold text-gold-soft tabular-nums">{formatBRL(tab.consumedCents)}</span>
      <span className="text-[11px] text-fg/70">{minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`}</span>
    </Link>
  );
}
