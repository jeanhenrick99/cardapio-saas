'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBRL, type MenuProduct, type PublicMenu } from '@cardapio/shared';
import {
  addLine,
  cartCount,
  cartTotalCents,
  parseStoredLines,
  reconcileLines,
  setQuantity,
  startingPriceCents,
  type CartLine,
} from '@/lib/cart';
import { CartSheet, type PlacedOrder } from './CartSheet';
import { ProductSheet } from './ProductSheet';

interface Props {
  menu: PublicMenu;
  table: string | null;
}

export function MenuApp({ menu, table }: Props) {
  const storageKey = `cardapio:cart:${menu.restaurant.slug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [restored, setRestored] = useState(false);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(menu.categories[0]?.id);
  const navRef = useRef<HTMLElement>(null);

  // Carrinho salvo no celular: sobrevive a recarregar a página.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLines(reconcileLines(parseStoredLines(JSON.parse(raw)), menu));
    } catch {
      // armazenamento indisponível (aba anônima, por exemplo): segue sem salvar
    }
    setRestored(true);
  }, [storageKey, menu]);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // idem
    }
  }, [lines, restored, storageKey]);

  // Destaca na barra a última categoria cujo título já passou do topo da tela.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const offset = (navRef.current?.offsetHeight ?? 0) + 24;
        let current = menu.categories[0]?.id;
        for (const c of menu.categories) {
          const el = document.getElementById(`cat-${c.id}`);
          if (el && el.getBoundingClientRect().top <= offset) current = c.id;
        }
        // No fim da página, a última categoria pode nunca chegar ao topo.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          current = menu.categories.at(-1)?.id ?? current;
        }
        setActiveCategory(current);
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
    };
  }, [menu]);

  useEffect(() => {
    navRef.current?.querySelector(`[data-cat="${activeCategory}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeCategory]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const closeProduct = useCallback(() => setProduct(null), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const count = cartCount(lines);

  if (placed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl dark:bg-green-900/40">✓</div>
        <h1 className="text-2xl font-bold">Pedido #{String(placed.number).padStart(4, '0')} enviado!</h1>
        <p className="text-stone-600 dark:text-stone-400">
          {table ? `Já estamos preparando. Ele será servido na mesa ${table}.` : 'Já estamos preparando o seu pedido.'}
        </p>
        <p className="text-lg font-semibold tabular-nums">Total: {formatBRL(placed.totalCents)}</p>
        <button
          onClick={() => setPlaced(null)}
          className="mt-4 rounded-xl border border-stone-300 px-5 py-3 font-semibold dark:border-stone-700"
        >
          Pedir mais alguma coisa
        </button>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-28">
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{menu.restaurant.name}</h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {table ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 font-semibold text-brand-700 dark:bg-brand-700/30 dark:text-brand-100">
              Mesa {table}
            </span>
          ) : (
            'Retirada no local ou delivery'
          )}
        </p>
      </header>

      {menu.categories.length === 0 ? (
        <p className="px-4 py-12 text-center text-stone-500">O cardápio ainda está sendo preparado. Volte em instantes!</p>
      ) : (
        <>
          <nav
            ref={navRef}
            aria-label="Categorias"
            className="no-scrollbar sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95"
          >
            {menu.categories.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                data-cat={c.id}
                aria-current={activeCategory === c.id ? 'true' : undefined}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === c.id
                    ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                    : 'bg-white text-stone-700 ring-1 ring-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800'
                }`}
              >
                {c.name}
              </a>
            ))}
          </nav>

          {menu.categories.map((category) => (
            <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-16 px-4 pt-6">
              <h2 className="mb-3 text-lg font-bold">{category.name}</h2>
              <ul className="space-y-3">
                {category.products.map((p) => {
                  const start = startingPriceCents(p);
                  const fromPrice = start !== p.priceCents || p.optionGroups.some((g) => g.options.some((o) => o.priceCents > 0));
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setProduct(p)}
                        className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200 transition hover:ring-brand-500 dark:bg-stone-900 dark:ring-stone-800"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{p.name}</div>
                          {p.description && (
                            <div className="mt-0.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{p.description}</div>
                          )}
                          <div className="mt-2 text-sm font-semibold text-stone-900 tabular-nums dark:text-stone-100">
                            {fromPrice && <span className="font-normal text-stone-500">a partir de </span>}
                            {formatBRL(start)}
                          </div>
                        </div>
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl leading-none text-white"
                        >
                          +
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl bg-brand-600 px-5 py-4 font-semibold text-white shadow-lg hover:bg-brand-700"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-sm tabular-nums">{count}</span>
              Ver carrinho
            </span>
            <span className="tabular-nums">{formatBRL(cartTotalCents(lines))}</span>
          </button>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 top-4 z-50 mx-auto w-fit rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-stone-900">
          {toast}
        </div>
      )}

      {product && (
        <ProductSheet
          key={product.id}
          product={product}
          onClose={closeProduct}
          onAdd={(line) => {
            setLines((l) => addLine(l, line));
            setProduct(null);
            setToast(`${line.quantity}x ${line.name} adicionado`);
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          slug={menu.restaurant.slug}
          table={table}
          lines={lines}
          onClose={closeCart}
          onChangeQuantity={(key, q) => {
            const next = setQuantity(lines, key, q);
            setLines(next);
            if (next.length === 0) setCartOpen(false);
          }}
          onPlaced={(order) => {
            setLines([]);
            setCartOpen(false);
            setPlaced(order);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}
