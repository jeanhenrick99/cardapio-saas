'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { buildLine, type CartLine } from '@/lib/cart';
import { api, ApiError } from '@/lib/client-api';
import type { AdminCategory } from '@/lib/menu-editor';
import { isQuickAdd, toPdvCategories, type PdvCategory, type PdvProduct } from '@/lib/pdv';
import { filterMenu, rankByName } from '@/lib/search';
import { priceLabel } from '../menu/ProductCard';
import { ProductSheet } from '../menu/ProductSheet';
import { SearchIcon } from '../ui/icons';
import { inputClass } from '../panel/styles';

export interface CatalogHandle {
  focusSearch: () => void;
  reload: () => void;
}

/**
 * Catálogo do PDV (cardápio completo da equipe): busca com "/" e Enter, abas de
 * categoria, toque para adicionar. No modo "Disponibilidade", o toque marca ou
 * desmarca o produto como esgotado (some/volta no cardápio do cliente na hora).
 */
export const Catalog = forwardRef<CatalogHandle, { slug: string; onAdd: (line: CartLine) => void }>(function Catalog(
  { slug, onAdd },
  ref,
) {
  const [categories, setCategories] = useState<PdvCategory[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [optionsFor, setOptionsFor] = useState<PdvProduct | null>(null);
  const [availabilityMode, setAvailabilityMode] = useState(false);
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<AdminCategory[]>(`/restaurants/${slug}/menu`)
      .then((c) => setCategories(toPdvCategories(c)))
      .catch((err: Error) => setFlash({ text: err.message, error: true }));
  }, [slug]);
  useEffect(load, [load]);

  useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus(), reload: load }), [load]);

  // Atalho: "/" vai para a busca (fora de outros campos).
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
    const t = setTimeout(() => setFlash(null), flash.error ? 4000 : 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const visible = useMemo(() => {
    const filtered = filterMenu(categories ?? [], search) as PdvCategory[];
    return categoryId && !search.trim() ? filtered.filter((c) => c.id === categoryId) : filtered;
  }, [categories, search, categoryId]);
  const products = rankByName(visible.flatMap((c) => c.products), search);

  async function toggleAvailability(product: PdvProduct) {
    try {
      await api(`/restaurants/${slug}/products/${product.id}/availability`, { method: 'PATCH', body: { active: product.soldOut } });
      setFlash({ text: product.soldOut ? `${product.name} disponível de novo` : `${product.name} marcado como esgotado` });
      load();
    } catch (err) {
      setFlash({ text: err instanceof ApiError ? err.message : 'Não foi possível alterar.', error: true });
    }
  }

  function select(product: PdvProduct) {
    if (availabilityMode) {
      void toggleAvailability(product);
      return;
    }
    if (product.soldOut) {
      setFlash({ text: `${product.name} está esgotado`, error: true });
      return;
    }
    if (!isQuickAdd(product)) {
      setOptionsFor(product);
      return;
    }
    onAdd(buildLine(product, new Set(), 1));
    setFlash({ text: `+1 ${product.name}` });
  }

  return (
    <section aria-label="Produtos" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Buscar produto</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim() && products[0]) {
                e.preventDefault();
                select(products[0]);
                setSearch('');
              }
              if (e.key === 'Escape') setSearch('');
            }}
            placeholder="Buscar produto...  (atalho: /)"
            className={`${inputClass} pl-10`}
          />
        </label>
        <button
          type="button"
          aria-pressed={availabilityMode}
          onClick={() => setAvailabilityMode((m) => !m)}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ${
            availabilityMode ? 'bg-gold text-black ring-gold' : 'text-muted ring-line hover:text-fg'
          }`}
          title="Marcar produtos como esgotados ou disponíveis"
        >
          {availabilityMode ? '✓ Concluir' : 'Disponibilidade'}
        </button>
      </div>

      {availabilityMode && (
        <p className="mt-2 rounded-xl border border-gold-deep/60 bg-gold/10 px-3 py-2 text-sm text-gold-soft">
          Toque num produto para marcar como <strong>esgotado</strong> ou <strong>disponível</strong>. Ele some ou volta no cardápio do cliente na hora.
        </p>
      )}

      {!search.trim() && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {[{ id: null, name: 'Todos' }, ...(categories ?? [])].map((c) => (
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

      {categories && products.length === 0 && <p className="py-10 text-center text-muted">Nenhum produto encontrado.</p>}
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {products.map((p, i) => {
          const { from, price } = priceLabel(p);
          return (
            <li key={p.id}>
              <button
                onClick={() => select(p)}
                className={`relative flex h-full min-h-20 w-full flex-col justify-between rounded-xl p-3 text-left ring-1 transition active:scale-[0.98] ${
                  p.soldOut ? 'bg-surface-2/60 ring-line' : 'bg-surface hover:ring-gold-deep'
                } ${search.trim() && i === 0 ? 'ring-gold' : p.soldOut ? '' : 'ring-line'}`}
              >
                <span className={`line-clamp-2 text-sm font-semibold ${p.soldOut ? 'text-muted line-through' : ''}`}>{p.name}</span>
                <span className="mt-2 flex items-end justify-between gap-2 text-xs">
                  <span className="font-semibold whitespace-nowrap text-gold tabular-nums">
                    {from && <span className="block text-[10px] font-normal text-muted">a partir de</span>}
                    {price}
                  </span>
                  {p.soldOut ? (
                    <span className="shrink-0 rounded-full bg-wine-deep px-2 py-0.5 text-[11px] font-semibold text-red-200">Esgotado</span>
                  ) : (
                    !isQuickAdd(p) && <span className="shrink-0 text-[11px] text-muted">opções ›</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {flash && (
        <div
          role="status"
          className={`fixed inset-x-0 top-20 z-50 mx-auto w-fit max-w-[90vw] rounded-full px-4 py-2 text-sm font-medium shadow-lg ring-1 lg:top-auto lg:bottom-6 ${
            flash.error ? 'bg-wine-deep text-red-200 ring-wine-hover' : 'bg-surface text-gold ring-gold-deep'
          }`}
        >
          {flash.text}
        </div>
      )}

      {optionsFor && (
        <ProductSheet
          key={optionsFor.id}
          product={optionsFor}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            onAdd(line);
            setOptionsFor(null);
            setFlash({ text: `+${line.quantity} ${line.name}` });
            searchRef.current?.focus();
          }}
        />
      )}
    </section>
  );
});
