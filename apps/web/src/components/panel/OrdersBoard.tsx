'use client';

import { useEffect, useRef, useState } from 'react';
import { formatBRL, itemTotalCents } from '@cardapio/shared';
import { orderTypeLabel, PRINT_STATUS, timeAgo } from '@/lib/panel';
import type { PanelOrder } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';

const TONE: Record<(typeof PRINT_STATUS)[keyof typeof PRINT_STATUS]['tone'], string> = {
  ok: 'text-emerald-300 ring-emerald-700/70',
  busy: 'text-gold ring-gold-deep',
  wait: 'text-muted ring-line',
  error: 'bg-wine-deep text-red-200 ring-wine-hover/60',
};

const NEW_HIGHLIGHT_MS = 15_000;

export function OrdersBoard({ slug }: { slug: string }) {
  const { data: orders, error, updatedAt } = usePolling<PanelOrder[]>(`/restaurants/${slug}/orders`, 5000);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const [, setTick] = useState(0);

  // Pedidos que chegaram desde a última atualização ganham destaque por alguns segundos.
  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.map((o) => o.id));
    if (known.current) {
      const arrived = orders.filter((o) => !known.current!.has(o.id)).map((o) => o.id);
      if (arrived.length) {
        setFresh((f) => new Set([...f, ...arrived]));
        setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !arrived.includes(id)))), NEW_HIGHLIGHT_MS);
      }
    }
    known.current = ids;
  }, [orders]);

  // Atualiza os "há X min" a cada 30 s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section aria-labelledby="pedidos">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 id="pedidos" className="font-display text-3xl font-semibold">
            Pedidos
          </h1>
          <p className="text-sm text-muted">Atualiza sozinho a cada 5 segundos.</p>
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {error ? <span className="text-red-300">⚠ {error}</span> : updatedAt ? `Atualizado ${timeAgo(new Date(updatedAt).toISOString())}` : 'Carregando...'}
        </p>
      </div>

      {orders && orders.length === 0 && (
        <div className="rounded-2xl p-10 text-center text-muted ring-1 ring-line">
          Nenhum pedido ainda. Assim que um cliente pedir, ele aparece aqui.
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders?.map((order) => {
          const isNew = fresh.has(order.id);
          const print = order.print ? PRINT_STATUS[order.print.status] : null;
          const failed = order.print?.printers?.filter((p) => p.status === 'failed') ?? [];
          return (
            <li
              key={order.id}
              className={`flex flex-col rounded-2xl bg-surface p-5 ring-1 transition ${isNew ? 'ring-2 ring-gold' : 'ring-line'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-2xl font-semibold text-gold">#{String(order.number).padStart(4, '0')}</span>
                    {isNew && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-black uppercase">Novo</span>}
                  </div>
                  <div className="text-xs text-muted">{timeAgo(order.createdAt)}</div>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase ring-1 ring-line">
                  {orderTypeLabel(order)}
                </span>
              </div>

              {order.customer && (
                <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <div className="font-semibold">{order.customer.name}</div>
                  {order.customer.phone && <div className="text-muted">{order.customer.phone}</div>}
                  {order.customer.address && <div className="text-muted">{order.customer.address}</div>}
                </div>
              )}

              <ul className="mt-3 flex-1 space-y-2 text-sm">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">
                        {item.quantity}x {item.name}
                      </span>
                      <span className="text-muted tabular-nums">{formatBRL(itemTotalCents(item))}</span>
                    </div>
                    {item.options.length > 0 && <div className="text-muted">+ {item.options.map((o) => o.name).join(', ')}</div>}
                    {item.notes && <div className="text-gold-soft">OBS: {item.notes}</div>}
                  </li>
                ))}
              </ul>
              {order.notes && <p className="mt-2 text-sm text-gold-soft">Pedido: {order.notes}</p>}

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-muted">{order.paymentMethod ?? '—'}</span>
                <span className="font-semibold text-gold tabular-nums">{formatBRL(order.totalCents)}</span>
              </div>

              {print && (
                <div className="mt-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TONE[print.tone]}`}>🖨 {print.label}</span>
                  {failed.map((p) => (
                    <div key={p.name} className="mt-1 text-xs text-red-300">
                      {p.name}: {p.error ?? 'erro'}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
