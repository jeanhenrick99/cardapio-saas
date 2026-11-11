'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { normalize } from '@/lib/search';
import type { Me, Role, StoreSettings } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import {
  BookIcon,
  ChevronIcon,
  ExternalIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  PrinterIcon,
  ReceiptIcon,
  SearchIcon,
  StoreIcon,
  SwapIcon,
} from '../ui/icons';

interface Props {
  me: Me;
  slug: string;
  restaurantName: string;
  role: Role;
  children: React.ReactNode;
}

type NavItem = { href: string; label: string; icon: (p: { className?: string }) => React.ReactElement };
type NavSection = { title?: string; items: NavItem[] };

const COLLAPSED_KEY = 'painel:menu-recolhido';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/**
 * Moldura do painel: menu lateral (restaurante, busca, seções) e barra superior.
 * No computador o menu fica fixo (e pode ser recolhido); no celular vira uma gaveta.
 */
export function PanelShell({ me, slug, restaurantName, role, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/painel/${slug}`;

  const sections: NavSection[] = useMemo(
    () => [
      { items: [{ href: base, label: 'Início', icon: HomeIcon }] },
      { title: 'Vendas', items: [{ href: `${base}/pedidos`, label: 'Pedidos', icon: ReceiptIcon }] },
      { title: 'Cadastros', items: [{ href: `${base}/cardapio`, label: 'Cardápio', icon: BookIcon }] },
      {
        title: 'Configurações',
        items: [
          { href: `${base}/loja`, label: 'Loja', icon: StoreIcon },
          { href: `${base}/impressoras`, label: 'Impressoras', icon: PrinterIcon },
        ],
      },
    ],
    [base],
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());
  const [switching, setSwitching] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: settings } = usePolling<StoreSettings>(`/restaurants/${slug}/settings`, 30_000);

  // Preferência de menu recolhido (só no computador) fica salva no navegador.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // sem armazenamento: começa aberto
    }
  }, []);

  // Fecha a gaveta do celular ao trocar de página.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Ctrl+K (ou Cmd+K) foca a busca do menu; Esc fecha a gaveta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCollapsed(false);
        setDrawerOpen(true);
        // Se o menu já está visível, foca na hora (para não perder o que o usuário digitar logo em seguida);
        // se ele estava recolhido/fechado, espera ele aparecer.
        const input = searchRef.current;
        if (input && input.offsetParent !== null) input.focus();
        else setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function toggleMenu() {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed((c) => {
        try {
          localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
        } catch {
          // ignora
        }
        return !c;
      });
    } else {
      setDrawerOpen((o) => !o);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const searching = normalize(query).length > 0;
  const matches = searching ? sections.flatMap((s) => s.items).filter((i) => normalize(i.label).includes(normalize(query))) : [];
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));
  const open = settings?.acceptingOrders;

  const navLink = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-[15px] transition-colors ${
          active ? 'border-gold bg-gold/10 font-semibold text-gold' : 'border-transparent text-fg/85 hover:bg-surface-2 hover:text-gold'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh lg:flex">
      {drawerOpen && <button aria-label="Fechar menu" tabIndex={-1} onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-30 bg-black/70 lg:hidden" />}

      {/* ---------- Menu lateral ---------- */}
      <aside
        aria-label="Menu do painel"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:hidden' : ''}`}
      >
        {/* Restaurante */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine font-display font-semibold text-gold ring-1 ring-gold/40">
            {initials(restaurantName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg leading-tight font-semibold">{restaurantName}</div>
            <div className="text-xs text-muted">Painel · {role === 'OWNER' ? 'Dono' : 'Equipe'}</div>
          </div>
          {me.restaurants.length > 1 && (
            <button
              onClick={() => setSwitching((s) => !s)}
              aria-expanded={switching}
              aria-label="Trocar de restaurante"
              title="Trocar de restaurante"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-gold"
            >
              <SwapIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        {switching && (
          <ul className="border-b border-line bg-bg/50 py-1">
            {me.restaurants.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/painel/${r.slug}`}
                  onClick={() => setSwitching(false)}
                  className={`block px-5 py-2 text-sm ${r.slug === slug ? 'text-gold' : 'text-muted hover:text-fg'}`}
                >
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Busca no menu */}
        <div className="px-3 pt-3">
          <label className="relative block">
            <span className="sr-only">Buscar no menu</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) {
                  router.push(matches[0].href);
                  setQuery('');
                }
              }}
              placeholder="Buscar no menu... (Ctrl+K)"
              className="w-full rounded-lg border border-line bg-bg py-2 pr-2 pl-9 text-sm outline-none placeholder:text-muted/70 focus:border-gold"
            />
          </label>
        </div>

        {/* Navegação */}
        <nav aria-label="Seções do painel" className="flex-1 overflow-y-auto px-3 py-3">
          {searching ? (
            matches.length ? (
              <div className="space-y-1">{matches.map(navLink)}</div>
            ) : (
              <p className="px-3 py-2 text-sm text-muted">Nada encontrado.</p>
            )
          ) : (
            <div className="space-y-2">
              {sections.map((section) => {
                if (!section.title) return <div key="inicio">{section.items.map(navLink)}</div>;
                const closed = closedSections.has(section.title);
                return (
                  <div key={section.title}>
                    <button
                      onClick={() =>
                        setClosedSections((s) => {
                          const next = new Set(s);
                          if (next.has(section.title!)) next.delete(section.title!);
                          else next.add(section.title!);
                          return next;
                        })
                      }
                      aria-expanded={!closed}
                      className="flex w-full items-center justify-between px-3 pt-3 pb-1 text-xs font-semibold tracking-[0.15em] text-muted uppercase hover:text-fg"
                    >
                      {section.title}
                      <ChevronIcon className={`h-4 w-4 transition-transform ${closed ? '-rotate-90' : ''}`} />
                    </button>
                    {!closed && <div className="space-y-1">{section.items.map(navLink)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        {/* Usuário */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-gold ring-1 ring-line">
            {initials(me.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{me.name}</div>
            <div className="truncate text-xs text-muted">{me.email}</div>
          </div>
          <button onClick={logout} aria-label="Sair" title="Sair" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-red-300">
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </aside>

      {/* ---------- Conteúdo ---------- */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-wine px-3 text-fg shadow-lg shadow-black/40 sm:px-5">
          <button
            onClick={toggleMenu}
            aria-label="Mostrar ou esconder o menu"
            className="rounded-lg p-2 text-gold-soft hover:bg-black/20"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="truncate text-sm font-semibold tracking-[0.15em] uppercase">{restaurantName}</span>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {settings && (
              <Link
                href={`${base}/loja`}
                title="Abrir ou fechar a loja"
                className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs font-semibold ring-1 ring-black/30 hover:bg-black/40"
              >
                <span className={`h-2 w-2 rounded-full ${open ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="hidden sm:inline">{open ? 'Loja aberta' : 'Loja fechada'}</span>
              </Link>
            )}
            <a
              href={`/r/${slug}`}
              target="_blank"
              rel="noreferrer"
              title="Ver cardápio do cliente"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-gold-soft hover:bg-black/20"
            >
              <ExternalIcon className="h-5 w-5" />
              <span className="hidden md:inline">Ver cardápio</span>
            </a>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
