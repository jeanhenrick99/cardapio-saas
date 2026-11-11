'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBRL, isSearchablePhone, type MenuProduct, type PublicMenu } from '@cardapio/shared';
import { addLine, buildLine, cartTotalCents, lineTotalCents, setQuantity, type CartLine } from '@/lib/cart';
import { api, ApiError } from '@/lib/client-api';
import { buildPdvCheckout, emptyPdvForm, isQuickAdd, type PdvForm, type PdvOrderType } from '@/lib/pdv';
import { filterMenu, rankByName } from '@/lib/search';
import { ProductSheet } from '../menu/ProductSheet';
import { priceLabel } from '../menu/ProductCard';
import { QuantityStepper } from '../ui/QuantityStepper';
import { SearchIcon } from '../ui/icons';
import { inputClass } from './styles';

const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'];
const TYPES: { value: PdvOrderType; label: string }[] = [
  { value: 'mesa', label: 'Mesa' },
  { value: 'retirada', label: 'Retirada' },
  { value: 'delivery', label: 'Delivery' },
];

interface FoundCustomer {
  name: string;
  phone: string;
  address: string | null;
  orders: number;
}

/** PDV: a equipe monta e lança pedidos de mesa, balcão (retirada) e telefone (delivery). */
export function PdvScreen({ slug }: { slug: string }) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [form, setForm] = useState<PdvForm>(emptyPdvForm('mesa'));
  const [optionsFor, setOptionsFor] = useState<MenuProduct | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState<FoundCustomer | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const orderRef = useRef<HTMLElement>(null);

  const loadMenu = useCallback(() => {
    api<PublicMenu>(`/public/restaurants/${slug}/menu`)
      .then(setMenu)
      .catch((err: Error) => setErrors([err.message]));
  }, [slug]);
  useEffect(loadMenu, [loadMenu]);

  // Atalho: "/" vai para a busca (quando não está digitando em outro campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  // Cliente que já pediu: busca pelo telefone (com DDD) e oferece preencher nome e endereço.
  useEffect(() => {
    setCustomer(null);
    if (form.type === 'mesa' || !isSearchablePhone(form.phone)) return;
    const timer = setTimeout(() => {
      api<FoundCustomer>(`/restaurants/${slug}/customers?phone=${encodeURIComponent(form.phone)}`)
        .then((found) => {
          setCustomer(found);
          setForm((f) => (f.name.trim() ? f : { ...f, name: found.name, address: f.address.trim() ? f.address : (found.address ?? '') }));
        })
        .catch(() => undefined); // 404 = cliente novo
    }, 400);
    return () => clearTimeout(timer);
  }, [form.phone, form.type, slug]);

  const categories = useMemo(() => {
    const filtered = filterMenu(menu?.categories ?? [], search);
    return categoryId && !search.trim() ? filtered.filter((c) => c.id === categoryId) : filtered;
  }, [menu, search, categoryId]);
  const products = rankByName(categories.flatMap((c) => c.products), search);

  function add(product: MenuProduct) {
    if (!isQuickAdd(product)) {
      setOptionsFor(product);
      return;
    }
    setLines((l) => addLine(l, buildLine(product, new Set(), 1)));
    setFlash(`+1 ${product.name}`);
    setSuccess(null);
  }

  const set = <K extends keyof PdvForm>(key: K, value: PdvForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    const { checkout, errors: problems } = buildPdvCheckout(lines, form);
    setErrors(problems);
    setSuccess(null);
    if (!checkout) return;
    setSubmitting(true);
    try {
      const { order } = await api<{ order: { number: number } }>(`/restaurants/${slug}/orders`, { method: 'POST', body: checkout });
      setSuccess(`Pedido #${String(order.number).padStart(4, '0')} lançado${form.type === 'mesa' ? ` para a mesa ${form.table.trim()}` : ''}.`);
      setLines([]);
      setCustomer(null);
      setForm((f) => ({ ...emptyPdvForm(f.type), paymentMethod: f.paymentMethod }));
      searchRef.current?.focus();
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : 'Não foi possível lançar o pedido.']);
      if (err instanceof ApiError && err.status === 422) loadMenu(); // produto pode ter esgotado
    } finally {
      setSubmitting(false);
    }
  }

  const total = cartTotalCents(lines);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ---------- Catálogo ---------- */}
      <section aria-label="Produtos" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h1 className="font-display text-3xl font-semibold">PDV</h1>
          <p className="text-xs text-muted">
            Atalhos: <kbd className="rounded bg-surface-2 px-1.5 ring-1 ring-line">/</kbd> busca ·{' '}
            <kbd className="rounded bg-surface-2 px-1.5 ring-1 ring-line">Enter</kbd> adiciona o primeiro
          </p>
        </div>

        <label className="relative block">
          <span className="sr-only">Buscar produto</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim() && products[0]) {
                e.preventDefault();
                add(products[0]);
                setSearch('');
              }
              if (e.key === 'Escape') setSearch('');
            }}
            placeholder="Buscar produto..."
            className={`${inputClass} pl-10`}
          />
        </label>

        {!search.trim() && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {[{ id: null, name: 'Todos' }, ...(menu?.categories ?? [])].map((c) => (
              <button
                key={c.id ?? 'todos'}
                onClick={() => setCategoryId(c.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
                  categoryId === c.id ? 'bg-gold text-black' : 'text-muted ring-1 ring-line hover:text-gold'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {menu && products.length === 0 && <p className="py-10 text-center text-muted">Nenhum produto encontrado.</p>}
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p, i) => {
            const { from, price } = priceLabel(p);
            return (
              <li key={p.id}>
                <button
                  onClick={() => add(p)}
                  className={`flex h-full min-h-20 w-full flex-col justify-between rounded-xl bg-surface p-3 text-left ring-1 transition hover:ring-gold-deep active:scale-[0.98] ${
                    search.trim() && i === 0 ? 'ring-gold' : 'ring-line'
                  }`}
                >
                  <span className="line-clamp-2 text-sm font-semibold">{p.name}</span>
                  <span className="mt-2 flex items-end justify-between gap-2 text-xs">
                    <span className="font-semibold whitespace-nowrap text-gold tabular-nums">
                      {from && <span className="block text-[10px] font-normal text-muted">a partir de</span>}
                      {price}
                    </span>
                    {!isQuickAdd(p) && <span className="shrink-0 text-[11px] text-muted">opções ›</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Celular: o pedido fica abaixo do catálogo; esta barra mostra o total e leva até ele. */}
      {lines.length > 0 && (
        <button
          type="button"
          onClick={() => orderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed inset-x-4 bottom-4 z-30 flex items-center justify-between rounded-2xl bg-wine px-5 py-3.5 font-semibold text-fg shadow-lg ring-1 shadow-black ring-gold/30 lg:hidden"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gold px-1.5 text-sm text-black tabular-nums">
              {lines.reduce((n, l) => n + l.quantity, 0)}
            </span>
            Ver pedido
          </span>
          <span className="tabular-nums">{formatBRL(total)}</span>
        </button>
      )}

      {/* ---------- Pedido ---------- */}
      <section ref={orderRef} aria-label="Pedido em montagem" className="scroll-mt-20 pb-20 lg:sticky lg:top-20 lg:self-start lg:pb-0">
        <div className="space-y-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line" role="radiogroup" aria-label="Tipo do pedido">
            {TYPES.map((t) => (
              <button
                key={t.value}
                role="radio"
                aria-checked={form.type === t.value}
                onClick={() => set('type', t.value)}
                className={`rounded-lg py-2 text-sm font-semibold ${form.type === t.value ? 'bg-gold text-black' : 'text-muted hover:text-fg'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {form.type === 'mesa' ? (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Mesa</span>
              <input inputMode="numeric" value={form.table} onChange={(e) => set('table', e.target.value)} className={inputClass} placeholder="Nº da mesa" />
            </label>
          ) : (
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
          )}

          {/* Itens */}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Itens</h2>
            {lines.length === 0 ? (
              <p className="rounded-xl px-3 py-4 text-center text-sm text-muted ring-1 ring-line">Toque nos produtos para adicionar.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {lines.map((line) => (
                  <li key={line.key} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{line.name}</div>
                      {line.options.length > 0 && <div className="truncate text-xs text-muted">{line.options.map((o) => o.name).join(', ')}</div>}
                      {line.notes && <div className="truncate text-xs text-gold-soft">“{line.notes}”</div>}
                      <div className="text-xs font-semibold text-gold tabular-nums">{formatBRL(lineTotalCents(line))}</div>
                    </div>
                    <QuantityStepper
                      size="sm"
                      min={0}
                      value={line.quantity}
                      onChange={(q) => setLines((l) => setQuantity(l, line.key, q))}
                      label={`quantidade de ${line.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
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

      {flash && (
        <div role="status" className="fixed inset-x-0 top-20 z-50 mx-auto w-fit lg:top-auto lg:bottom-6 rounded-full bg-surface px-4 py-2 text-sm font-medium text-gold shadow-lg ring-1 ring-gold-deep">
          {flash}
        </div>
      )}

      {optionsFor && (
        <ProductSheet
          key={optionsFor.id}
          product={optionsFor}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            setLines((l) => addLine(l, line));
            setOptionsFor(null);
            setFlash(`+${line.quantity} ${line.name}`);
            setSuccess(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
