'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import type { Me, Role } from '@/lib/types';

interface Props {
  me: Me;
  slug: string;
  restaurantName: string;
  role: Role;
  children: React.ReactNode;
}

/** Moldura do painel: restaurante atual, troca de restaurante, abas e saída. */
export function PanelShell({ me, slug, restaurantName, role, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/painel/${slug}`;
  const tabs = [
    { href: base, label: 'Pedidos' },
    { href: `${base}/loja`, label: 'Loja' },
    { href: `${base}/impressoras`, label: 'Impressoras' },
  ];

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display font-semibold text-gold ring-1 ring-gold-deep">
              {restaurantName.slice(0, 1).toUpperCase()}
            </span>
            {me.restaurants.length > 1 ? (
              <select
                aria-label="Trocar de restaurante"
                value={slug}
                onChange={(e) => router.push(`/painel/${e.target.value}`)}
                className="min-w-0 truncate rounded-lg bg-transparent py-1 font-display text-lg font-semibold outline-none focus:ring-1 focus:ring-gold"
              >
                {me.restaurants.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate font-display text-lg font-semibold">{restaurantName}</span>
            )}
            <span className="hidden rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wider text-muted uppercase ring-1 ring-line sm:inline">
              {role === 'OWNER' ? 'Dono' : 'Equipe'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-4 text-sm">
            <a href={`/r/${slug}`} target="_blank" rel="noreferrer" className="text-gold hover:text-gold-soft">
              Ver cardápio ↗
            </a>
            <span className="hidden text-muted md:inline">{me.name}</span>
            <button onClick={logout} className="text-muted hover:text-fg">
              Sair
            </button>
          </div>
        </div>

        <nav aria-label="Seções do painel" className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap ${
                  active ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
