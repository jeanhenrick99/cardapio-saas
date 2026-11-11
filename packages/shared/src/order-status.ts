import type { OrderType } from './order';

/**
 * Ciclo de vida do pedido. O mesmo código roda na API (que valida as mudanças)
 * e no painel (que só mostra os botões/colunas permitidos).
 */
export const ORDER_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const FLOWS: Record<OrderType, OrderStatus[]> = {
  delivery: ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'],
  retirada: ['RECEIVED', 'PREPARING', 'READY', 'COMPLETED'],
  mesa: ['RECEIVED', 'PREPARING', 'READY', 'COMPLETED'],
};

/** Etapas do pedido em ordem (sem o cancelado). */
export function statusFlow(type: OrderType): OrderStatus[] {
  return FLOWS[type];
}

/**
 * Mudanças permitidas:
 * - avançar ou voltar UMA etapa (voltar corrige um clique errado)
 * - cancelar a qualquer momento antes de concluir
 * - cancelado é definitivo
 */
export function canTransition(type: OrderType, from: OrderStatus, to: OrderStatus): boolean {
  if (from === to || from === 'CANCELED') return false;
  if (to === 'CANCELED') return from !== 'COMPLETED';
  const flow = FLOWS[type];
  const a = flow.indexOf(from);
  const b = flow.indexOf(to);
  return a !== -1 && b !== -1 && Math.abs(a - b) === 1;
}

export function nextStatus(type: OrderType, status: OrderStatus): OrderStatus | null {
  const flow = FLOWS[type];
  const i = flow.indexOf(status);
  return i === -1 || i === flow.length - 1 ? null : flow[i + 1]!;
}

export function previousStatus(type: OrderType, status: OrderStatus): OrderStatus | null {
  const i = FLOWS[type].indexOf(status);
  return i <= 0 ? null : FLOWS[type][i - 1]!;
}

const LABELS: Record<OrderStatus, string> = {
  RECEIVED: 'Recebido',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
};

/** Nome da etapa; "Concluído" muda conforme o tipo (Entregue, Retirado, Servido). */
export function statusLabel(status: OrderStatus, type?: OrderType): string {
  if (status === 'COMPLETED' && type) return { delivery: 'Entregue', retirada: 'Retirado', mesa: 'Servido' }[type];
  if (status === 'READY' && type === 'retirada') return 'Pronto para retirar';
  return LABELS[status];
}

/** Texto do botão que avança o pedido para a próxima etapa. */
export function advanceLabel(type: OrderType, status: OrderStatus): string | null {
  const next = nextStatus(type, status);
  if (!next) return null;
  return {
    RECEIVED: 'Receber',
    PREPARING: 'Iniciar preparo',
    READY: 'Marcar pronto',
    OUT_FOR_DELIVERY: 'Saiu para entrega',
    COMPLETED: type === 'delivery' ? 'Confirmar entrega' : type === 'retirada' ? 'Confirmar retirada' : 'Marcar servido',
    CANCELED: 'Cancelar',
  }[next];
}
