'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBRL, itemTotalCents, statusLabel, tabTotals } from '@cardapio/shared';
import { addLine, cartTotalCents, toCheckoutItems, type CartLine } from '@/lib/cart';
import { api, ApiError } from '@/lib/client-api';
import { useLiveEvents } from '@/lib/live';
import { centsToInput, parseBRL, timeAgo } from '@/lib/panel';
import type { TabDetail } from '@/lib/types';
import { inputClass, primaryButton } from '../panel/styles';
import { Sheet } from '../ui/Sheet';
import { CartLines } from './CartLines';
import { Catalog, type CatalogHandle } from './Catalog';

const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'];

/**
 * Conta de uma mesa ou comanda: consumo (pedidos já lançados), novo lançamento e fechamento.
 * Mesa/comanda livre: o primeiro lançamento abre a conta.
 */
export function TabScreen({ slug, kind, number }: { slug: string; kind: 'mesa' | 'comanda'; number: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabDetail | null | undefined>(undefined); // undefined = carregando, null = livre
  const [lines, setLines] = useState<CartLine[]>([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const catalog = useRef<CatalogHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  const title = `${kind === 'mesa' ? 'Mesa' : 'Comanda'} ${number}`;
  const back = `/pdv/${slug}/${kind === 'mesa' ? 'mesas' : 'comandas'}`;

  const load = useCallback(async () => {
    try {
      setTab(await api<TabDetail>(`/restaurants/${slug}/tabs/current?kind=${kind.toUpperCase()}&number=${encodeURIComponent(number)}`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setTab(null);
      else setMessage({ ok: false, text: err instanceof Error ? err.message : 'Erro ao carregar a conta.' });
    }
  }, [slug, kind, number]);
  useEffect(() => void load(), [load]);
  useLiveEvents((e) => (e.type === 'tabs_changed' || e.type === 'order_status' || e.type === 'order_created') && void load());

  async function send() {
    if (lines.length === 0) return;
    setSending(true);
    setMessage(null);
    try {
      const { order } = await api<{ order: { number: number } }>(`/restaurants/${slug}/orders`, {
        method: 'POST',
        body: { type: kind, table: number, items: toCheckoutItems(lines) },
      });
      setLines([]);
      setMessage({ ok: true, text: `Pedido #${String(order.number).padStart(4, '0')} lançado na ${title.toLowerCase()} e enviado para a impressão.` });
      await load();
      catalog.current?.focusSearch();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Não foi possível lançar.' });
      if (err instanceof ApiError && err.status === 422) catalog.current?.reload();
    } finally {
      setSending(false);
    }
  }

  const newTotal = cartTotalCents(lines);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <Link href={back} className="rounded-lg px-2 py-1 text-sm text-muted ring-1 ring-line hover:text-fg">
            ← {kind === 'mesa' ? 'Mesas' : 'Comandas'}
          </Link>
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
        </div>
        <Catalog ref={catalog} slug={slug} onAdd={(line) => setLines((l) => addLine(l, line))} />
      </div>

      {lines.length > 0 && (
        <button
          type="button"
          onClick={() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-2xl bg-wine px-5 py-3.5 font-semibold text-fg shadow-lg ring-1 shadow-black ring-gold/30 lg:hidden"
        >
          <span>Ver lançamento ({lines.reduce((n, l) => n + l.quantity, 0)})</span>
          <span className="tabular-nums">{formatBRL(newTotal)}</span>
        </button>
      )}

      <section
        ref={panelRef}
        aria-label={`Conta da ${title}`}
        className="scroll-mt-20 space-y-4 pb-20 lg:sticky lg:top-24 lg:self-start lg:pb-0"
      >
        {/* Consumo */}
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              <p className="text-xs text-muted">
                {tab === undefined
                  ? 'Carregando...'
                  : tab
                    ? `Aberta ${timeAgo(tab.openedAt)}${tab.openedBy ? ` por ${tab.openedBy}` : ''}`
                    : 'Livre: o primeiro lançamento abre a conta'}
              </p>
            </div>
            {tab && <span className="font-display text-2xl font-semibold text-gold tabular-nums">{formatBRL(tab.consumedCents)}</span>}
          </div>

          {tab && tab.orders.length > 0 && (
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {tab.orders.map((o) => {
                const canceled = o.status === 'CANCELED';
                return (
                  <li key={o.id} className={`rounded-xl bg-surface-2 px-3 py-2 text-sm ${canceled ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between text-xs text-muted">
                      <span>
                        #{String(o.number).padStart(4, '0')} · {timeAgo(o.createdAt)} · {o.origin === 'pdv' ? (o.staffName ?? 'PDV') : 'QR Code'}
                      </span>
                      <span className={canceled ? 'text-red-300' : ''}>{statusLabel(o.status, 'mesa')}</span>
                    </div>
                    {o.items.map((i) => (
                      <div key={i.id} className={`flex justify-between gap-2 ${canceled ? 'line-through' : ''}`}>
                        <span className="min-w-0 truncate">
                          {i.quantity}x {i.name}
                          {i.options.length > 0 && <span className="text-muted"> ({i.options.map((x) => x.name).join(', ')})</span>}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatBRL(itemTotalCents(i))}</span>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}

          {tab && (
            <button onClick={() => setClosing(true)} className={`${primaryButton} mt-4 w-full py-3`}>
              Fechar conta
            </button>
          )}
        </div>

        {/* Novo lançamento */}
        <div className="space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 className="text-sm font-semibold">Novo lançamento</h2>
          <CartLines lines={lines} onChange={setLines} empty="Toque nos produtos para lançar nesta conta." />
          {message && (
            <p
              role={message.ok ? 'status' : 'alert'}
              className={`rounded-xl px-3 py-2 text-sm ring-1 ${message.ok ? 'text-emerald-300 ring-emerald-700/70' : 'bg-wine-deep text-red-200 ring-wine-hover/60'}`}
            >
              {message.text}
            </p>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || lines.length === 0}
            className="flex w-full items-center justify-between rounded-xl px-4 py-3 font-semibold text-gold ring-1 ring-gold-deep hover:ring-gold disabled:opacity-40"
          >
            <span>{sending ? 'Lançando...' : `Lançar na ${title.toLowerCase()}`}</span>
            <span className="tabular-nums">{formatBRL(newTotal)}</span>
          </button>
        </div>
      </section>

      {closing && tab && (
        <CloseTabSheet
          slug={slug}
          tab={tab}
          title={title}
          pendingItems={lines.length}
          onClose={() => setClosing(false)}
          onClosed={() => {
            setClosing(false);
            router.push(back);
          }}
        />
      )}
    </div>
  );
}

function CloseTabSheet({
  slug,
  tab,
  title,
  pendingItems,
  onClose,
  onClosed,
}: {
  slug: string;
  tab: TabDetail;
  title: string;
  pendingItems: number;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]!);
  const [applyServiceFee, setApplyServiceFee] = useState(tab.serviceFeePercent > 0);
  const [discount, setDiscount] = useState(centsToInput(0));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const discountCents = parseBRL(discount);
  const totals = tabTotals(tab.consumedCents, { serviceFeePercent: tab.serviceFeePercent, applyServiceFee, discountCents: discountCents ?? 0 });

  async function confirm() {
    if (discountCents === null) {
      setError('Desconto inválido. Use um valor como 5,00.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/restaurants/${slug}/tabs/${tab.id}/close`, { method: 'POST', body: { paymentMethod, applyServiceFee, discountCents } });
      onClosed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível fechar a conta.');
      setSaving(false);
    }
  }

  const row = (label: string, cents: number, strong = false) => (
    <div className={`flex justify-between ${strong ? 'text-lg font-semibold text-gold' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatBRL(cents)}</span>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Fechar conta · ${title}`}
      footer={
        <button onClick={() => void confirm()} disabled={saving} className={`${primaryButton} flex w-full items-center justify-between py-3`}>
          <span>{saving ? 'Fechando...' : 'Confirmar fechamento'}</span>
          <span className="tabular-nums">{formatBRL(totals.totalCents)}</span>
        </button>
      }
    >
      <div className="space-y-4">
        {pendingItems > 0 && (
          <p className="rounded-xl border border-gold-deep/60 bg-gold/10 px-3 py-2 text-sm text-gold-soft">
            Atenção: há {pendingItems} item(ns) no lançamento que ainda não foram enviados e não entram nesta conta.
          </p>
        )}
        <div className="space-y-1.5 rounded-xl bg-surface-2 p-3 ring-1 ring-line">
          {row(`Consumo (${tab.ordersCount} pedido(s))`, totals.subtotalCents)}
          {tab.serviceFeePercent > 0 && row(`Taxa de serviço (${tab.serviceFeePercent}%)`, totals.serviceFeeCents)}
          {totals.discountCents > 0 && row('Desconto', -totals.discountCents)}
          <div className="border-t border-line pt-1.5">{row('Total', totals.totalCents, true)}</div>
        </div>

        {tab.serviceFeePercent > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={applyServiceFee} onChange={(e) => setApplyServiceFee(e.target.checked)} className="h-5 w-5 accent-gold" />
            Cobrar taxa de serviço ({tab.serviceFeePercent}%)
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Pagamento</span>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Desconto</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">R$</span>
              <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputClass} pl-10`} />
            </div>
          </label>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
