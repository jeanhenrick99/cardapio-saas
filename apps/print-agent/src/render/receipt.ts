import {
  formatBRL,
  itemTotalCents,
  orderSubtotalCents,
  orderTotalCents,
  type Order,
  type OrderItem,
} from '@cardapio/shared';
import type { PrinterConfig } from '../config';
import { twoColumns, wrap } from './layout';
import type { Columns, Receipt, ReceiptLine } from './receipt-doc';

/** Itens do pedido que pertencem aos setores desta impressora. */
export function itemsForPrinter(order: Order, printer: Pick<PrinterConfig, 'sectors'>): OrderItem[] {
  if (printer.sectors.includes('*')) return order.items;
  return order.items.filter((item) => printer.sectors.includes(item.sector));
}

export interface TicketOptions {
  title: string;
  columns: Columns;
  showPrices: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function origin(order: Order): string {
  switch (order.type) {
    case 'mesa':
      return order.table ? `MESA ${order.table}` : 'MESA';
    case 'comanda':
      return order.table ? `COMANDA ${order.table}` : 'COMANDA';
    case 'delivery':
      return 'DELIVERY';
    case 'retirada':
      return 'RETIRADA';
  }
}

export function buildTicket(order: Order, items: OrderItem[], opts: TicketOptions): Receipt {
  const { columns, showPrices } = opts;
  const lines: ReceiptLine[] = [];
  const text = (t: string, style: Omit<Extract<ReceiptLine, { kind: 'text' }>, 'kind' | 'text'> = {}) =>
    lines.push({ kind: 'text', text: t, ...style });
  const big = (t: string) => wrap(t, columns / 2).forEach((l) => text(l, { align: 'center', bold: true, size: 2 }));

  // Cabeçalho
  big(opts.title.toUpperCase());
  big(`PEDIDO #${String(order.number).padStart(4, '0')}`);
  text(origin(order), { align: 'center', bold: true });
  text(formatDateTime(order.createdAt), { align: 'center' });
  if (order.origin === 'pdv') {
    wrap(order.staffName ? `PDV - lançado por ${order.staffName}` : 'Lançado no PDV', columns).forEach((l) => text(l, { align: 'center' }));
  }

  if (order.customer) {
    lines.push({ kind: 'divider' });
    wrap(`Cliente: ${order.customer.name}`, columns, '  ').forEach((l) => text(l));
    if (order.customer.phone) text(`Tel: ${order.customer.phone}`);
    if (order.customer.address) wrap(`End: ${order.customer.address}`, columns, '     ').forEach((l) => text(l));
  }

  // Itens
  lines.push({ kind: 'divider' });
  for (const item of items) {
    const label = `${item.quantity}x ${item.name}`;
    const head = showPrices ? twoColumns(label, formatBRL(itemTotalCents(item)), columns, '   ') : wrap(label, columns, '   ');
    head.forEach((l) => text(l, { bold: true }));
    for (const option of item.options) {
      wrap(`+ ${option.name}`, columns - 3, '  ').forEach((l) => text(`   ${l}`));
    }
    if (item.notes) {
      wrap(`OBS: ${item.notes}`, columns - 3, '     ').forEach((l) => text(`   ${l}`, { bold: true }));
    }
  }
  lines.push({ kind: 'divider' });

  // Totais (somente na via com preços)
  if (showPrices) {
    const row = (label: string, cents: number, bold = false) =>
      twoColumns(label, formatBRL(cents), columns).forEach((l) => text(l, { bold }));
    row('Subtotal', orderSubtotalCents(order));
    if (order.deliveryFeeCents > 0) row('Taxa de entrega', order.deliveryFeeCents);
    if (order.discountCents > 0) row('Desconto', -order.discountCents);
    row('TOTAL', orderTotalCents(order), true);
    if (order.paymentMethod) text(`Pagamento: ${order.paymentMethod}`);
    lines.push({ kind: 'divider' });
  }

  if (order.notes) {
    text('OBSERVAÇÕES DO PEDIDO:', { bold: true });
    wrap(order.notes, columns).forEach((l) => text(l));
    lines.push({ kind: 'divider' });
  }

  lines.push({ kind: 'feed', lines: 2 }, { kind: 'cut' });
  return { columns, lines };
}
