'use client';

import { useMemo, useState } from 'react';
import {
  advanceLabel,
  canTransition,
  formatBRL,
  nextStatus,
  previousStatus,
  statusFlow,
  statusLabel,
  type OrderStatus,
} from '@cardapio/shared';
import { api, ApiError } from '@/lib/client-api';
import { useLiveEvents, usePollingInterval } from '@/lib/live';
import { itemsSummary, PRINT_STATUS, waitingLevel } from '@/lib/panel';
import type { PanelOrder } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';

type Filter = 'todos' | 'delivery' | 'retirada';

const COLUMNS = statusFlow('delivery'); // RECEIVED → PREPARING → READY → OUT_FOR_DELIVERY → COMPLETED
const COLUMN_TITLES: Record<OrderStatus, string> = {
  RECEIVED: 'Recebidos',
  PREPARING: 'Em preparo',
  READY: 'Prontos',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluídos (12 h)',
  CANCELED: 'Cancelados',
};

const WAIT_TONE = { ok: 'text-muted', warn: 'text-gold-soft', late: 'font-semibold text-red-300' } as const;

/** Quadro Kanban de delivery e retirada: arrastar (computador) ou botões (celular). */
export function DeliveryBoard({ slug }: { slug: string }) {
  const { data, refresh, error } = usePolling<PanelOrder[]>(`/restaurants/${slug}/orders?view=board`, usePollingInterval());
  const [overrides, setOverrides] = useState<Record<string, OrderStatus>>({}); // mudanças otimistas
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<PanelOrder | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [message, setMessage] = useState<string | null>(null);

  useLiveEvents((e) => {
    if (e.type === 'order_created' || e.type === 'order_status' || e.type === 'order_updated') void refresh();
  });

  const orders = useMemo(
    () =>
      (data ?? [])
        .map((o) => (overrides[o.id] ? { ...o, status: overrides[o.id]! } : o))
        .filter((o) => o.status !== 'CANCELED' && (filter === 'todos' || o.type === filter)),
    [data, overrides, filter],
  );

  async function move(order: PanelOrder, to: OrderStatus) {
    if (!canTransition(order.type, order.status, to) || busy.has(order.id)) return;
    if (to === 'CANCELED' && !window.confirm(`Cancelar o pedido #${String(order.number).padStart(4, '0')}?`)) return;
    setMessage(null);
    setOverrides((o) => ({ ...o, [order.id]: to }));
    setBusy((b) => new Set(b).add(order.id));
    try {
      await api(`/restaurants/${slug}/orders/${order.id}/status`, { method: 'PATCH', body: { status: to } });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Não foi possível mudar o pedido.');
    } finally {
      await refresh();
      setOverrides((o) => {
        const { [order.id]: _removed, ...rest } = o;
        return rest;
      });
      setBusy((b) => {
        const next = new Set(b);
        next.delete(order.id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Delivery e retirada</h1>
          <p className="text-sm text-muted">Arraste os cards entre as colunas ou use os botões de cada pedido.</p>
        </div>
        <div className="flex rounded-xl bg-surface-2 p-1 ring-1 ring-line" role="radiogroup" aria-label="Filtrar pedidos">
          {(['todos', 'delivery', 'retirada'] as const).map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${filter === f ? 'bg-gold text-black' : 'text-muted hover:text-fg'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {(message || error) && (
        <p role="alert" className="rounded-xl bg-wine-deep px-4 py-3 text-sm text-red-200 ring-1 ring-wine-hover/60">
          {message ?? error}
        </p>
      )}

      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        {COLUMNS.map((column) => {
          const cards = orders.filter((o) => o.status === column);
          const allowed = dragging ? canTransition(dragging.type, dragging.status, column) : false;
          return (
            <section
              key={column}
              aria-label={COLUMN_TITLES[column]}
              onDragOver={(e) => allowed && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && allowed) void move(dragging, column);
                setDragging(null);
              }}
              className={`flex w-72 shrink-0 snap-start flex-col rounded-2xl p-3 ring-1 transition-colors ${
                dragging ? (allowed ? 'bg-gold/5 outline-2 outline-gold outline-dashed' : 'opacity-50 ring-line') : 'bg-surface/50 ring-line'
              }`}
            >
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold tracking-wide text-gold-soft uppercase">
                {COLUMN_TITLES[column]}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg tabular-nums ring-1 ring-line">{cards.length}</span>
              </h2>
              <ul className="flex min-h-24 flex-1 flex-col gap-3">
                {cards.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    busy={busy.has(order.id)}
                    onMove={(to) => void move(order, to)}
                    onDragStart={() => setDragging(order)}
                    onDragEnd={() => setDragging(null)}
                  />
                ))}
                {cards.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted">Nenhum pedido</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  order: PanelOrder;
  busy: boolean;
  onMove: (to: OrderStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const next = nextStatus(order.type, order.status);
  const prev = previousStatus(order.type, order.status);
  const done = order.status === 'COMPLETED';
  const wait = waitingLevel(order.createdAt);
  const print = order.print ? PRINT_STATUS[order.print.status] : null;

  return (
    <li
      draggable={!busy}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', order.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-xl bg-surface p-3 ring-1 ring-line active:cursor-grabbing ${busy ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display text-xl font-semibold text-gold">#{String(order.number).padStart(4, '0')}</span>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-line">
          {order.type === 'delivery' ? '🛵 Delivery' : '🛍 Retirada'}
        </span>
      </div>
      <div className={`text-xs ${done ? 'text-muted' : WAIT_TONE[wait.level]}`}>
        {done ? statusLabel('COMPLETED', order.type) : `${wait.minutes} min desde o pedido`}
        {order.origin === 'pdv' && <span className="text-muted"> · PDV</span>}
      </div>

      {order.customer && (
        <div className="mt-2 text-sm">
          <div className="font-semibold">{order.customer.name}</div>
          {order.customer.phone && (
            <a href={`tel:${order.customer.phone.replace(/[^\d+]/g, '')}`} className="text-xs text-muted hover:text-gold">
              {order.customer.phone}
            </a>
          )}
          {order.type === 'delivery' && order.customer.address && <div className="line-clamp-2 text-xs text-muted">{order.customer.address}</div>}
        </div>
      )}

      <p className="mt-2 line-clamp-2 text-xs text-fg/80">{itemsSummary(order.items)}</p>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted">
          {order.paymentMethod ?? '—'}
          {print && print.tone === 'error' && <span className="ml-1 text-red-300">· 🖨 falhou</span>}
        </span>
        <span className="font-semibold text-gold tabular-nums">{formatBRL(order.totalCents)}</span>
      </div>

      {!done && (
        <div className="mt-3 flex items-center gap-1.5">
          {prev && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMove(prev)}
              aria-label={`Voltar para ${statusLabel(prev, order.type)}`}
              title={`Voltar para ${statusLabel(prev, order.type)}`}
              className="rounded-lg px-2 py-1.5 text-sm text-muted ring-1 ring-line hover:text-fg disabled:opacity-50"
            >
              ←
            </button>
          )}
          {next && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMove(next)}
              className="flex-1 rounded-lg bg-wine px-2 py-1.5 text-sm font-semibold text-fg ring-1 ring-gold/30 hover:bg-wine-hover disabled:opacity-50"
            >
              {advanceLabel(order.type, order.status)} →
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onMove('CANCELED')}
            aria-label="Cancelar pedido"
            title="Cancelar pedido"
            className="rounded-lg px-2 py-1.5 text-sm text-red-300 ring-1 ring-line hover:bg-wine-deep disabled:opacity-50"
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}
