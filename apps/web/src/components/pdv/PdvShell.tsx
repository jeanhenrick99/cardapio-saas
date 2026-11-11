'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import { LiveProvider, useLiveEvents, useLiveStatus } from '@/lib/live';
import type { Me, Role, StoreSettings } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { BikeIcon, LogoutIcon, PosIcon } from '../ui/icons';

interface Props {
  me: Me;
  slug: string;
  restaurantName: string;
  role: Role;
  liveUrl: string;
  children: React.ReactNode;
}

/**
 * Moldura do PDV: tela cheia, abas grandes (pensadas para tablet no balcão),
 * status ao vivo e da loja. O botão "Retaguarda" só aparece para o dono.
 */
export function PdvShell(props: Props) {
  return (
    <LiveProvider slug={props.slug} url={props.liveUrl}>
      <Frame {...props} />
    </LiveProvider>
  );
}

function Frame({ me, slug, restaurantName, role, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/pdv/${slug}`;
  const live = useLiveStatus();
  const { data: settings, refresh } = usePolling<StoreSettings>(`/restaurants/${slug}/settings`, 60_000);
  useLiveEvents((e) => e.type === 'store_updated' && void refresh());

  const tabs = [
    { href: `${base}/balcao`, label: 'Balcão', icon: PosIcon },
    { href: `${base}/delivery`, label: 'Delivery', icon: BikeIcon },
  ];

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-md bg-wine px-2 py-0.5 text-xs font-bold tracking-widest text-gold uppercase ring-1 ring-gold/40">PDV</span>
            <span className="truncate font-display text-lg font-semibold">{restaurantName}</span>
          </div>

          <nav aria-label="Áreas do PDV" className="order-last flex w-full gap-2 sm:order-none sm:w-auto">
            {tabs.map((t) => {
              const active = pathname.startsWith(t.href);
              const Icon = t.icon;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold sm:flex-none ${
                    active ? 'bg-gold text-black' : 'text-muted ring-1 ring-line hover:text-fg'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5" title={live === 'live' ? 'Conectado: atualiza na hora' : 'Reconectando...'}>
              <span className={`h-2 w-2 rounded-full ${live === 'live' ? 'animate-pulse bg-emerald-400' : 'bg-gold-soft/60'}`} />
              <span className="hidden md:inline">{live === 'live' ? 'Ao vivo' : 'Reconectando'}</span>
            </span>
            {settings && (
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className={`h-2 w-2 rounded-full ${settings.acceptingOrders ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {settings.acceptingOrders ? 'Loja aberta' : 'Loja fechada'}
              </span>
            )}
            {role === 'OWNER' && (
              <Link href={`/painel/${slug}`} className="rounded-lg px-3 py-1.5 text-gold ring-1 ring-gold-deep hover:ring-gold">
                Retaguarda
              </Link>
            )}
            <span className="hidden text-muted lg:inline">{me.name}</span>
            <button onClick={logout} aria-label="Sair" title="Sair" className="rounded-lg p-1.5 text-muted hover:text-red-300">
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 sm:px-6">{children}</main>
    </div>
  );
}
