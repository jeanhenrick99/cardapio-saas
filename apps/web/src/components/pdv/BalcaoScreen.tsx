'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatBRL, isSearchablePhone } from '@cardapio/shared';
import { addLine, cartTotalCents, type CartLine } from '@/lib/cart';
import { api, ApiError } from '@/lib/client-api';
import { buildPdvCheckout, emptyPdvForm, type PdvForm } from '@/lib/pdv';
import { inputClass } from '../panel/styles';
import { CartLines } from './CartLines';
import { Catalog, type CatalogHandle } from './Catalog';

const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'];

interface FoundCustomer {
  name: string;
  phone: string;
  address: string | null;
  orders: number;
}

/** Balcão: pedidos de retirada e delivery (telefone). Mesas e comandas têm abas próprias. */
export function BalcaoScreen({ slug }: { slug: string }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [form, setForm] = useState<PdvForm>(emptyPdvForm('retirada'));
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState<FoundCustomer | null>(null);
  const catalog = useRef<CatalogHandle>(null);
  const orderRef = useRef<HTMLElement>(null);

  // Cliente que já pediu: o telefone (com DDD) preenche nome e endereço.
  useEffect(() => {
    setCustomer(null);
    if (!isSearchablePhone(form.phone)) return;
    const timer = setTimeout(() => {
      api<FoundCustomer>(`/restaurants/${slug}/customers?phone=${encodeURIComponent(form.phone)}`)
        .then((found) => {
          setCustomer(found);
          setForm((f) => (f.name.trim() ? f : { ...f, name: found.name, address: f.address.trim() ? f.address : (found.address ?? '') }));
        })
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [form.phone, slug]);

  const set = <K extends keyof PdvForm>(key: K, value: PdvForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const { checkout, errors: problems } = buildPdvCheckout(lines, form);
    setErrors(problems);
    setSuccess(null);
    if (!checkout) return;
    setSubmitting(true);
    try {
      const { order } = await api<{ order: { number: number } }>(`/restaurants/${slug}/orders`, { method: 'POST', body: checkout });
      setSuccess(`Pedido #${String(order.number).padStart(4, '0')} lançado. Ele já aparece no quadro de delivery e balcão.`);
      setLines([]);
      setCustomer(null);
      setForm((f) => ({ ...emptyPdvForm(f.type), paymentMethod: f.paymentMethod }));
      catalog.current?.focusSearch();
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Não foi possível lançar o pedido.']);
      if (err instanceof ApiError && err.status === 422) catalog.current?.reload();
    } finally {
      setSubmitting(false);
    }
  }

  const total = cartTotalCents(lines);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-3">
          <Link href={`/pdv/${slug}/delivery`} className="rounded-lg px-2 py-1 text-sm text-muted ring-1 ring-line hover:text-fg">
            ← Quadro
          </Link>
          <h1 className="font-display text-2xl font-semibold">Novo pedido · retirada ou delivery</h1>
        </div>
        <Catalog ref={catalog} slug={slug} onAdd={(line) => { setLines((l) => addLine(l, line)); setSuccess(null); }} />
      </div>

      {lines.length > 0 && (
        <button
          type="button"
          onClick={() => orderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-2xl bg-wine px-5 py-3.5 font-semibold text-fg shadow-lg ring-1 shadow-black ring-gold/30 lg:hidden"
        >
          <span>Ver pedido ({lines.reduce((n, l) => n + l.quantity, 0)})</span>
          <span className="tabular-nums">{formatBRL(total)}</span>
        </button>
      )}

      <section ref={orderRef} aria-label="Pedido em montagem" className="scroll-mt-20 pb-20 lg:sticky lg:top-24 lg:self-start lg:pb-0">
        <div className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line" role="radiogroup" aria-label="Tipo do pedido">
            {(['retirada', 'delivery'] as const).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={form.type === t}
                onClick={() => set('type', t)}
                className={`rounded-lg py-2 text-sm font-semibold capitalize ${form.type === t ? 'bg-gold text-black' : 'text-muted hover:text-fg'}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">
                Telefone {form.type === 'retirada' && <span className="font-normal text-muted">(opcional)</span>}
              </span>
              <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} placeholder="(11) 99999-0000" />
              {customer && (
                <span className="mt-1 block text-xs text-emerald-300">
                  ✓ Cliente conhecido: {customer.name} · {customer.orders} pedido(s) anterior(es)
                  {(form.name !== customer.name || (customer.address && form.address !== customer.address)) && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, name: customer.name, address: customer.address ?? f.address }))}
                      className="ml-2 text-gold underline"
                    >
                      usar dados
                    </button>
                  )}
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Nome do cliente</span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </label>
            {form.type === 'delivery' && (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Endereço</span>
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  className={`${inputClass} resize-none`}
                  placeholder="Rua, número, complemento e bairro"
                />
              </label>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Itens</h2>
            <CartLines lines={lines} onChange={setLines} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Pagamento</span>
              <select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} className={`${inputClass} py-2 text-sm`}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Observação</span>
              <input value={form.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} className={`${inputClass} py-2 text-sm`} placeholder="Ex.: troco p/ 50" />
            </label>
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="space-y-0.5 rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
              {errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
          {success && (
            <p role="status" className="rounded-xl px-3 py-2 text-sm text-emerald-300 ring-1 ring-emerald-700/70">
              ✓ {success}
            </p>
          )}

          <div className="flex items-center gap-2">
            {lines.length > 0 && (
              <button type="button" onClick={() => setLines([])} className="rounded-xl px-3 py-3 text-sm text-muted ring-1 ring-line hover:text-red-300">
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="flex flex-1 items-center justify-between rounded-xl bg-wine px-4 py-3 font-semibold text-fg ring-1 ring-gold/30 hover:bg-wine-hover disabled:opacity-60"
            >
              <span>{submitting ? 'Lançando...' : 'Lançar pedido'}</span>
              <span className="tabular-nums">{formatBRL(total)}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
