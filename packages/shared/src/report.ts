import { totalsByPayment, type PaymentTotal } from './payment';

/**
 * Fuso do restaurante: horário de Brasília (UTC−3, sem horário de verão desde 2019).
 * Um "dia" de relatório vai de 00:00 a 23:59 nesse horário, não em UTC.
 */
export const BUSINESS_UTC_OFFSET_HOURS = -3;
const OFFSET_MS = BUSINESS_UTC_OFFSET_HOURS * 3_600_000;
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Dia local ("2026-11-11") de um instante. */
export function localDay(instant: Date | string): string {
  return new Date(new Date(instant).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante (UTC) em que começa o dia local. */
export function dayStart(day: string): Date {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - OFFSET_MS);
}

export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Período [início do dia `from`, início do dia seguinte a `to`). */
export function periodRange(from: string, to: string): { start: Date; end: Date; days: number } {
  const start = dayStart(from);
  const end = dayStart(addDays(to, 1));
  return { start, end, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) };
}

export interface ReportOrder {
  type: string;
  status: string;
  totalCents: number;
  createdAt: Date | string;
  /** Pedido de mesa/comanda: é pago no fechamento da conta, não conta como recebimento. */
  tabId: string | null;
  paymentMethod: string | null;
  items: { name: string; quantity: number; cents: number }[];
}

export interface ReportTab {
  closedAt: Date | string;
  totalCents: number;
  paymentMethod: string | null;
  serviceFeeCents: number;
  discountCents: number;
}

export interface SalesReport {
  from: string;
  to: string;
  /** Recebido: delivery/retirada/balcão + contas de mesa e comanda fechadas. */
  revenueCents: number;
  /** Atendimentos pagos: pedidos avulsos + contas fechadas. */
  receiptsCount: number;
  averageTicketCents: number;
  ordersCount: number;
  canceledCount: number;
  canceledCents: number;
  serviceFeeCents: number;
  discountCents: number;
  byPayment: PaymentTotal[];
  byType: { type: string; count: number; cents: number }[];
  byDay: { day: string; cents: number; count: number }[];
  topProducts: { name: string; quantity: number; cents: number }[];
}

const TYPE_ORDER = ['mesa', 'comanda', 'retirada', 'delivery'];

/** Relatório de vendas do período. Função pura: a API só busca os dados e entrega aqui. */
export function buildSalesReport(input: { from: string; to: string; orders: ReportOrder[]; tabs: ReportTab[] }, topN = 10): SalesReport {
  const valid = input.orders.filter((o) => o.status !== 'CANCELED');
  const canceled = input.orders.filter((o) => o.status === 'CANCELED');

  const receipts = [
    ...valid.filter((o) => !o.tabId).map((o) => ({ at: o.createdAt, paymentMethod: o.paymentMethod, amountCents: o.totalCents })),
    ...input.tabs.map((t) => ({ at: t.closedAt, paymentMethod: t.paymentMethod, amountCents: t.totalCents })),
  ];
  const revenueCents = receipts.reduce((s, r) => s + r.amountCents, 0);

  const byDayMap = new Map<string, { day: string; cents: number; count: number }>();
  const { days } = periodRange(input.from, input.to);
  for (let i = 0; i < days; i++) {
    const day = addDays(input.from, i);
    byDayMap.set(day, { day, cents: 0, count: 0 });
  }
  for (const r of receipts) {
    const entry = byDayMap.get(localDay(r.at));
    if (entry) {
      entry.cents += r.amountCents;
      entry.count += 1;
    }
  }

  const typeMap = new Map<string, { type: string; count: number; cents: number }>();
  const productMap = new Map<string, { name: string; quantity: number; cents: number }>();
  for (const o of valid) {
    const t = typeMap.get(o.type) ?? { type: o.type, count: 0, cents: 0 };
    t.count += 1;
    t.cents += o.totalCents;
    typeMap.set(o.type, t);
    for (const item of o.items) {
      const p = productMap.get(item.name) ?? { name: item.name, quantity: 0, cents: 0 };
      p.quantity += item.quantity;
      p.cents += item.cents;
      productMap.set(item.name, p);
    }
  }
  const typeRank = (t: string) => (TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : TYPE_ORDER.length);

  return {
    from: input.from,
    to: input.to,
    revenueCents,
    receiptsCount: receipts.length,
    averageTicketCents: receipts.length ? Math.round(revenueCents / receipts.length) : 0,
    ordersCount: valid.length,
    canceledCount: canceled.length,
    canceledCents: canceled.reduce((s, o) => s + o.totalCents, 0),
    serviceFeeCents: input.tabs.reduce((s, t) => s + t.serviceFeeCents, 0),
    discountCents: input.tabs.reduce((s, t) => s + t.discountCents, 0),
    byPayment: totalsByPayment(receipts),
    byType: [...typeMap.values()].sort((a, b) => typeRank(a.type) - typeRank(b.type)),
    byDay: [...byDayMap.values()],
    topProducts: [...productMap.values()].sort((a, b) => b.quantity - a.quantity || b.cents - a.cents).slice(0, topN),
  };
}
