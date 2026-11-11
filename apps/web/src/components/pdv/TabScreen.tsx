'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkPayments, formatBRL, itemTotalCents, PAYMENT_METHODS, splitEvenly, statusLabel, tabTotals } from '@cardapio/shared';
import { addLine, cartTotalCents, toCheckoutItems, type CartLine } from '@/lib/cart';
import { api, ApiError } from '@/lib/client-api';
import { useLiveEvents } from '@/lib/live';
import { centsToInput, parseBRL, timeAgo } from '@/lib/panel';
import type { TabDetail } from '@/lib/types';
import { inputClass, primaryButton, secondaryButton } from '../panel/styles';
import { QuantityStepper } from '../ui/QuantityStepper';
import { Sheet } from '../ui/Sheet';
import { CartLines } from './CartLines';
import { Catalog, type CatalogHandle } from './Catalog';


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
  const [transferring, setTransferring] = useState(false);
  const catalog = useRef<CatalogHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  const title = `${kind === 'mesa' ? 'Mesa' : 'Comanda'} ${number}`;
  const back = `/pdv/${slug}/salao`;

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
            ← Mesas e comandas
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
            <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
              <button onClick={() => setTransferring(true)} className={`${secondaryButton} py-3`}>
                Transferir
              </button>
              <button onClick={() => setClosing(true)} className={`${primaryButton} py-3`}>
                Fechar conta
              </button>
            </div>
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

      {transferring && tab && (
        <TransferSheet
          slug={slug}
          tab={tab}
          title={title}
          onClose={() => setTransferring(false)}
          onDone={(result, whole) => {
            setTransferring(false);
            const target = `${result.kind === 'MESA' ? 'Mesa' : 'Comanda'} ${result.number}`;
            if (whole) {
              router.push(`/pdv/${slug}/conta/${result.kind === 'MESA' ? 'mesa' : 'comanda'}/${encodeURIComponent(result.number)}`);
            } else {
              setMessage({ ok: true, text: `${result.moved} lançamento(s) transferido(s) para ${target}.` });
              void load();
            }
          }}
        />
      )}

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

interface TransferResult {
  kind: 'MESA' | 'COMANDA';
  number: string;
  moved: number;
  merged: boolean;
}

/** Transfere a conta inteira, ou os lançamentos marcados, para outra mesa ou comanda. */
function TransferSheet({
  slug,
  tab,
  title,
  onClose,
  onDone,
}: {
  slug: string;
  tab: TabDetail;
  title: string;
  onClose: () => void;
  onDone: (result: TransferResult, whole: boolean) => void;
}) {
  const [kind, setKind] = useState<'MESA' | 'COMANDA'>(tab.kind);
  const [number, setNumber] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(tab.orders.map((o) => o.id)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const whole = selected.size === tab.orders.length;
  const movedCents = tab.orders.filter((o) => selected.has(o.id) && o.status !== 'CANCELED').reduce((s, o) => s + o.totalCents, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (!number.trim()) return setError(`Informe o número da ${kind === 'MESA' ? 'mesa' : 'comanda'} de destino.`);
    if (selected.size === 0) return setError('Marque pelo menos um lançamento.');
    setSaving(true);
    setError(null);
    try {
      const result = await api<TransferResult>(`/restaurants/${slug}/tabs/${tab.id}/transfer`, {
        method: 'POST',
        body: { kind, number: number.trim(), ...(whole ? {} : { orderIds: [...selected] }) },
      });
      onDone(result, whole);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível transferir.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Transferir · ${title}`}
      footer={
        <button onClick={() => void confirm()} disabled={saving} className={`${primaryButton} flex w-full items-center justify-between py-3`}>
          <span>{saving ? 'Transferindo...' : whole ? 'Transferir a conta inteira' : `Transferir ${selected.size} lançamento(s)`}</span>
          <span className="tabular-nums">{formatBRL(movedCents)}</span>
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line" role="radiogroup" aria-label="Destino">
            {(['MESA', 'COMANDA'] as const).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${kind === k ? 'bg-gold text-black' : 'text-muted hover:text-fg'}`}
              >
                {k === 'MESA' ? 'Mesa' : 'Comanda'}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Para {kind === 'MESA' ? 'a mesa' : 'a comanda'} nº</span>
            <input autoFocus value={number} maxLength={20} onChange={(e) => setNumber(e.target.value)} className={inputClass} />
          </label>
        </div>
        <p className="text-xs text-muted">Se o destino já tiver conta aberta, as contas são juntadas. Se estiver livre, a conta muda de lugar.</p>

        <fieldset className="space-y-2">
          <legend className="mb-1 flex w-full items-center justify-between text-sm font-semibold">
            Lançamentos
            <button
              type="button"
              onClick={() => setSelected(whole ? new Set() : new Set(tab.orders.map((o) => o.id)))}
              className="text-xs font-normal text-gold"
            >
              {whole ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </legend>
          {tab.orders.map((o) => (
            <label key={o.id} className={`flex cursor-pointer gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ${selected.has(o.id) ? 'ring-gold-deep' : 'ring-line'}`}>
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-gold" />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2 text-xs text-muted">
                  <span>
                    #{String(o.number).padStart(4, '0')} · {timeAgo(o.createdAt)}
                    {o.status === 'CANCELED' && ' · cancelado'}
                  </span>
                  <span className="tabular-nums">{formatBRL(o.totalCents)}</span>
                </span>
                <span className="block truncate">{o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

interface PaymentRow {
  method: string;
  amount: string;
}

/**
 * Fechamento: taxa de serviço, desconto e um ou mais pagamentos.
 * "Dividir em N" reparte o total igualmente; editar um valor passa para o modo manual
 * (ex.: um paga R$ 30 no Pix e o resto vai no cartão).
 */
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
  const [applyServiceFee, setApplyServiceFee] = useState(tab.serviceFeePercent > 0);
  const [discount, setDiscount] = useState(centsToInput(0));
  const [rows, setRows] = useState<PaymentRow[]>([{ method: PAYMENT_METHODS[0], amount: '' }]);
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const discountCents = parseBRL(discount);
  const totals = tabTotals(tab.consumedCents, { serviceFeePercent: tab.serviceFeePercent, applyServiceFee, discountCents: discountCents ?? 0 });
  const total = totals.totalCents;
  const amounts = auto ? splitEvenly(total, rows.length) : rows.map((r) => parseBRL(r.amount) ?? 0);
  const payments = total === 0 ? [] : rows.map((r, i) => ({ method: r.method, amountCents: amounts[i] ?? 0 }));
  const check = checkPayments(total, payments);

  /** Congela os valores mostrados (sai do modo automático) e aplica a mudança. */
  const manual = (change: (rows: PaymentRow[]) => PaymentRow[]) => {
    setAuto(false);
    setRows((current) => change(current.map((r, i) => ({ ...r, amount: centsToInput(amounts[i] ?? 0) }))));
  };

  function splitInto(n: number) {
    setAuto(true);
    setRows((current) => Array.from({ length: n }, (_, i) => current[i] ?? { method: current[current.length - 1]!.method, amount: '' }));
  }

  async function confirm() {
    if (discountCents === null) return setError('Desconto inválido. Use um valor como 5,00.');
    if (!check.ok) return setError(check.remainingCents > 0 ? `Faltam ${formatBRL(check.remainingCents)}.` : 'Confira os valores dos pagamentos.');
    setSaving(true);
    setError(null);
    try {
      await api(`/restaurants/${slug}/tabs/${tab.id}/close`, { method: 'POST', body: { payments, applyServiceFee, discountCents } });
      onClosed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível fechar a conta.');
      setSaving(false);
    }
  }

  const row = (label: string, cents: number, strong = false) => (
    <div className={`flex justify-between ${strong ? 'text-lg font-semibold text-gold' : 'text-sm'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{cents < 0 ? `−${formatBRL(-cents)}` : formatBRL(cents)}</span>
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Fechar conta · ${title}`}
      footer={
        <button onClick={() => void confirm()} disabled={saving || !check.ok} className={`${primaryButton} flex w-full items-center justify-between py-3`}>
          <span>{saving ? 'Fechando...' : 'Confirmar fechamento'}</span>
          <span className="tabular-nums">{formatBRL(total)}</span>
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
          <div className="border-t border-line pt-1.5">{row('Total', total, true)}</div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          {tab.serviceFeePercent > 0 ? (
            <label className="flex items-center gap-2 pb-2.5 text-sm">
              <input type="checkbox" checked={applyServiceFee} onChange={(e) => setApplyServiceFee(e.target.checked)} className="h-5 w-5 accent-gold" />
              Taxa de serviço ({tab.serviceFeePercent}%)
            </label>
          ) : (
            <span />
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Desconto</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">R$</span>
              <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${inputClass} pl-10`} />
            </div>
          </label>
        </div>

        {total > 0 && (
          <section aria-label="Pagamentos" className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Pagamento</h3>
              <span className="flex items-center gap-2 text-sm text-muted">
                Dividir em
                <QuantityStepper size="sm" min={1} max={20} value={rows.length} onChange={splitInto} label="dividir a conta em quantas partes" />
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  aria-label={`Forma do pagamento ${i + 1}`}
                  value={r.method}
                  onChange={(e) => setRows((current) => current.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}
                  className={`${inputClass} w-auto flex-1 py-2`}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <div className="relative w-36">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
                  <input
                    aria-label={`Valor do pagamento ${i + 1}`}
                    inputMode="decimal"
                    value={auto ? centsToInput(amounts[i] ?? 0) : r.amount}
                    onChange={(e) => manual((current) => current.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    className={`${inputClass} py-2 pl-9 text-right tabular-nums`}
                  />
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover pagamento ${i + 1}`}
                    onClick={() => manual((current) => current.filter((_, j) => j !== i))}
                    className="rounded-lg px-2 py-1 text-muted hover:text-red-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => manual((current) => [...current, { method: PAYMENT_METHODS[0], amount: centsToInput(Math.max(0, check.remainingCents)) }])}
                className="text-gold"
              >
                + Adicionar forma
              </button>
              <span aria-live="polite">
                {check.remainingCents > 0 ? (
                  <span className="font-semibold text-red-300">Falta {formatBRL(check.remainingCents)}</span>
                ) : check.remainingCents < 0 ? (
                  <span className="font-semibold text-red-300">Passou {formatBRL(-check.remainingCents)}</span>
                ) : check.ok ? (
                  <span className="font-semibold text-emerald-300">✓ Pagamentos conferem</span>
                ) : (
                  <span className="text-red-300">Valor zerado em algum pagamento</span>
                )}
              </span>
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
