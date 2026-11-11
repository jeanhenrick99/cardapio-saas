'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatBRL } from '@cardapio/shared';
import { api } from '@/lib/client-api';
import type { AdminCategory } from '@/lib/menu-editor';
import { orderTypeLabel, PRINT_STATUS, summarizeToday, timeAgo } from '@/lib/panel';
import type { Agent, PanelOrder, StoreSettings } from '@/lib/types';
import { useLiveEvents, usePollingInterval } from '@/lib/live';
import { usePolling } from '@/lib/use-polling';
import { BookIcon, ChartIcon, ExternalIcon, PrinterIcon, ReceiptIcon, StoreIcon } from '../ui/icons';

/** Tela inicial do painel: números do dia e atalhos para o que precisa de atenção. */
export function Dashboard({ slug }: { slug: string }) {
  const base = `/painel/${slug}`;
  const interval = usePollingInterval();
  const { data: orders, refresh: refreshOrders } = usePolling<PanelOrder[]>(`/restaurants/${slug}/orders?limit=100`, interval);
  const { data: agents, refresh: refreshAgents } = usePolling<Agent[]>(`/restaurants/${slug}/agents`, interval);
  const { data: settings, refresh: refreshSettings } = usePolling<StoreSettings>(`/restaurants/${slug}/settings`, interval);

  useLiveEvents((event) => {
    if (event.type === 'order_created' || event.type === 'order_updated') void refreshOrders();
    if (event.type === 'agents_changed') void refreshAgents();
    if (event.type === 'store_updated') void refreshSettings();
  });
  const [menu, setMenu] = useState<AdminCategory[] | null>(null);

  useEffect(() => {
    api<AdminCategory[]>(`/restaurants/${slug}/menu`).then(setMenu).catch(() => setMenu([]));
  }, [slug]);

  const today = orders ? summarizeToday(orders) : null;
  const activeAgents = agents?.filter((a) => !a.revokedAt) ?? [];
  const online = activeAgents.filter((a) => a.online).length;
  const waiting = orders?.filter((o) => o.print?.status === 'QUEUED' || o.print?.status === 'FAILED').length ?? 0;
  const products = menu?.flatMap((c) => c.products) ?? [];
  const soldOut = products.filter((p) => !p.active).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Início</h1>
        <p className="text-sm text-muted">Resumo de hoje, {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
      </div>

      {/* Indicadores do dia */}
      <ul className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Pedidos hoje" value={today ? String(today.count) : '—'} />
        <Kpi label="Faturamento hoje" value={today ? formatBRL(today.revenueCents) : '—'} />
        <Kpi label="Ticket médio" value={today ? formatBRL(today.averageCents) : '—'} />
      </ul>

      {/* Atalhos */}
      <div className="space-y-3">
        <ActionCard
          icon={<StoreIcon className="h-7 w-7" />}
          title={settings ? (settings.acceptingOrders ? 'Loja aberta' : 'Loja fechada') : 'Loja'}
          description={
            settings
              ? settings.acceptingOrders
                ? `Recebendo pedidos · retirada em ${settings.pickupMinutes} min · entrega em ${settings.deliveryMinutes} min`
                : 'O cardápio está visível, mas os pedidos estão pausados.'
              : 'Carregando...'
          }
          tone={settings && !settings.acceptingOrders ? 'alert' : 'normal'}
          href={`${base}/loja`}
          action="Gerenciar loja"
        />
        <ActionCard
          icon={<PrinterIcon className="h-7 w-7" />}
          title="Impressoras"
          description={
            agents
              ? activeAgents.length === 0
                ? 'Nenhum computador conectado. Pareie o agente para imprimir os pedidos automaticamente.'
                : `${online} de ${activeAgents.length} computador(es) online${waiting ? ` · ${waiting} pedido(s) aguardando impressão` : ''}`
              : 'Carregando...'
          }
          tone={agents && (activeAgents.length === 0 || (waiting > 0 && online === 0)) ? 'alert' : 'normal'}
          href={`${base}/impressoras`}
          action="Ver impressoras"
        />
        <ActionCard
          icon={<BookIcon className="h-7 w-7" />}
          title="Cardápio"
          description={menu ? `${products.length} produto(s) em ${menu.length} categoria(s)${soldOut ? ` · ${soldOut} esgotado(s)` : ''}` : 'Carregando...'}
          href={`${base}/cardapio`}
          action="Editar cardápio"
        />
        <ActionCard
          icon={<ExternalIcon className="h-7 w-7" />}
          title="Cardápio do cliente"
          description="É o link que vai no QR Code das mesas. Abra para ver como o cliente vê."
          href={`/r/${slug}`}
          external
          action="Abrir cardápio"
        />
      </div>

      {/* Últimos pedidos */}
      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <ReceiptIcon className="h-5 w-5 text-gold" /> Últimos pedidos
          </h2>
          <Link href={`${base}/pedidos`} className="text-sm text-gold hover:text-gold-soft">
            Ver todos →
          </Link>
        </div>
        {!orders ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted">Nenhum pedido ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="font-display text-lg font-semibold text-gold">#{String(o.number).padStart(4, '0')}</span>
                <span className="text-muted">{orderTypeLabel(o)}</span>
                <span className="text-muted">{timeAgo(o.createdAt)}</span>
                <span className="ml-auto text-xs text-muted">{o.print ? PRINT_STATUS[o.print.status].label : ''}</span>
                <span className="w-24 text-right font-semibold text-gold tabular-nums">{formatBRL(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="flex items-center gap-2 text-sm text-muted">
        <ChartIcon className="h-4 w-4 text-gold" />
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-semibold text-gold tabular-nums">{value}</div>
    </li>
  );
}

function ActionCard({
  icon,
  title,
  description,
  href,
  action,
  external = false,
  tone = 'normal',
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  action: string;
  external?: boolean;
  tone?: 'normal' | 'alert';
}) {
  const button = 'shrink-0 rounded-lg px-4 py-2 text-sm font-semibold tracking-wide uppercase';
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-2xl p-5 ring-1 ${tone === 'alert' ? 'bg-wine-deep/50 ring-wine-hover/60' : 'bg-surface ring-line'}`}>
      <span className="text-gold">{icon}</span>
      <div className="min-w-48 flex-1">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-muted">{description}</div>
      </div>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={`${button} text-gold ring-1 ring-gold-deep hover:ring-gold`}>
          {action} ↗
        </a>
      ) : (
        <Link href={href} className={`${button} bg-wine text-fg ring-1 ring-gold/30 hover:bg-wine-hover`}>
          {action} ›
        </Link>
      )}
    </div>
  );
}
