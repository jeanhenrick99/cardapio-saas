import type { Order } from '@cardapio/shared';
import type { PrintStatus } from './types';

/** "agora", "há 3 min", "há 2 h", "há 3 dias". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function orderTypeLabel(order: Pick<Order, 'type' | 'table'>): string {
  if (order.type === 'mesa') return order.table ? `Mesa ${order.table}` : 'Mesa';
  return order.type === 'delivery' ? 'Delivery' : 'Retirada';
}

export const PRINT_STATUS: Record<PrintStatus, { label: string; tone: 'ok' | 'wait' | 'busy' | 'error' }> = {
  PRINTED: { label: 'Impresso', tone: 'ok' },
  SENT: { label: 'Enviado à impressora', tone: 'busy' },
  QUEUED: { label: 'Aguardando impressora', tone: 'wait' },
  FAILED: { label: 'Falha na impressão', tone: 'error' },
};

/** Converte o que o usuário digita ("30", "30,5", "1.234,56", "R$ 30,00") em centavos. */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/R\$|\s/g, '');
  if (!cleaned) return 0;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [reais, centavos = ''] = cleaned.replace(/\./g, '').split(',');
  return Number(reais) * 100 + Number(centavos.padEnd(2, '0'));
}

/** Centavos para o campo de texto: 3000 → "30,00". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Indicadores do dia (pedidos criados desde a meia-noite, no horário local). */
export function summarizeToday(orders: { createdAt: string; totalCents: number }[], now: Date = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = orders.filter((o) => new Date(o.createdAt) >= midnight);
  const revenueCents = today.reduce((sum, o) => sum + o.totalCents, 0);
  return {
    count: today.length,
    revenueCents,
    averageCents: today.length ? Math.round(revenueCents / today.length) : 0,
  };
}

/** Minutos desde o pedido e o nível de alerta (para pedidos ainda em andamento). */
export function waitingLevel(createdAt: string, now: number = Date.now()): { minutes: number; level: 'ok' | 'warn' | 'late' } {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  return { minutes, level: minutes >= 45 ? 'late' : minutes >= 30 ? 'warn' : 'ok' };
}

/** Resumo curto dos itens para o card: "2x X-Burguer, 1x Coca-Cola". */
export function itemsSummary(items: { quantity: number; name: string }[]): string {
  return items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
}
