'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBRL, type MenuProduct, type PublicMenu } from '@cardapio/shared';
import { addLine, cartCount, cartTotalCents, parseStoredLines, reconcileLines, setQuantity, type CartLine } from '@/lib/cart';
import { filterMenu } from '@/lib/search';
import { CartSheet, type PlacedOrder } from './CartSheet';
import { HighlightCard, ProductCard } from './ProductCard';
import { ProductSheet } from './ProductSheet';
import { StoreHeader } from './StoreHeader';

interface Props {
  menu: PublicMenu;
  table: string | null;
}

export function MenuApp({ menu, table }: Props) {
  const { restaurant } = menu;
  const storageKey = `cardapio:cart:${restaurant.slug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [restored, setRestored] = useState(false);
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navRef = useRef<HTMLElement>(null);

  const categories = useMemo(() => filterMenu(menu.categories, search), [menu.categories, search]);
  const highlights = useMemo(() => menu.categories.flatMap((c) => c.products).filter((p) => p.featured), [menu.categories]);
  const searching = search.trim().length > 0;
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id);

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
        let current = categories[0]?.id;
        for (const c of categories) {
          const el = document.getElementById(`cat-${c.id}`);
          if (el && el.getBoundingClientRect().top <= offset) current = c.id;
        }
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          current = categories.at(-1)?.id ?? current;
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
  }, [categories]);

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
        <div className="flex h-20 w-20 items-center justify-center rounded-full text-4xl text-gold ring-1 ring-gold">✓</div>
        <h1 className="font-display text-3xl font-semibold">Pedido #{String(placed.number).padStart(4, '0')} enviado!</h1>
        <p className="text-muted">
          {table ? `Já estamos preparando. Ele será servido na mesa ${table}.` : 'Já estamos preparando o seu pedido.'}
        </p>
        <p className="text-lg font-semibold text-gold tabular-nums">Total: {formatBRL(placed.totalCents)}</p>
        <button
          onClick={() => setPlaced(null)}
          className="mt-4 rounded-xl border border-gold-deep px-5 py-3 font-semibold text-gold hover:border-gold"
        >
          Pedir mais alguma coisa
        </button>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
      <StoreHeader restaurant={restaurant} table={table} search={search} onSearch={setSearch} />

      {menu.categories.length === 0 ? (
        <p className="py-16 text-center text-muted">O cardápio ainda está sendo preparado. Volte em instantes!</p>
      ) : (
        <>
          {/* Destaques */}
          {!searching && highlights.length > 0 && (
            <section aria-labelledby="destaques" className="mt-8">
              <h2 id="destaques" className="mb-3 font-display text-2xl font-semibold text-gold-soft">
                Destaques
              </h2>
              <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
                {highlights.map((p) => (
                  <HighlightCard key={p.id} product={p} onSelect={() => setProduct(p)} />
                ))}
              </div>
            </section>
          )}

          {/* Atalhos das categorias */}
          {categories.length > 0 && (
            <nav
              ref={navRef}
              aria-label="Categorias"
              className="no-scrollbar sticky top-0 z-10 -mx-4 mt-6 flex gap-2 overflow-x-auto border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
            >
              {categories.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.id}`}
                  data-cat={c.id}
                  aria-current={activeCategory === c.id ? 'true' : undefined}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                    activeCategory === c.id ? 'bg-gold text-black' : 'text-muted ring-1 ring-line hover:text-gold'
                  }`}
                >
                  {c.name}
                </a>
              ))}
            </nav>
          )}

          {searching && categories.length === 0 && (
            <p className="py-16 text-center text-muted">
              Nenhum item encontrado para <strong className="text-fg">“{search.trim()}”</strong>.
            </p>
          )}

          {/* Categorias em grade */}
          {categories.map((category) => (
            <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-20 pt-8">
              <h2 className="mb-4 text-sm font-semibold tracking-[0.2em] text-gold-soft uppercase">{category.name}</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {category.products.map((p) => (
                  <li key={p.id}>
                    <ProductCard product={p} onSelect={() => setProduct(p)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <footer className="mt-16 border-t border-line pt-6 text-center text-xs text-muted">
        Cardápio digital por{' '}
        <a href="/" className="font-display text-sm font-semibold text-fg hover:text-gold">
          Bistr<span className="text-gold">oo</span>
        </a>
      </footer>

      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-wine px-5 py-4 font-semibold text-fg shadow-lg ring-1 shadow-black ring-gold/30 hover:bg-wine-hover"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gold px-1.5 text-sm text-black tabular-nums">{count}</span>
              Ver carrinho
            </span>
            <span className="tabular-nums">{formatBRL(cartTotalCents(lines))}</span>
          </button>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 top-4 z-50 mx-auto w-fit rounded-full bg-surface px-4 py-2 text-sm font-medium text-gold shadow-lg ring-1 ring-gold-deep">
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
          restaurant={restaurant}
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
