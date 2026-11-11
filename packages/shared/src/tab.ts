/**
 * Fechamento da conta (mesa/comanda). Usado pela API (que grava) e pelo PDV (que mostra a prévia).
 *   total = subtotal + taxa de serviço − desconto   (nunca negativo)
 */
export interface TabTotals {
  subtotalCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
}

export function tabTotals(
  subtotalCents: number,
  opts: { serviceFeePercent: number; applyServiceFee: boolean; discountCents?: number },
): TabTotals {
  const serviceFeeCents = opts.applyServiceFee ? Math.round((subtotalCents * Math.max(0, opts.serviceFeePercent)) / 100) : 0;
  const discountCents = Math.min(Math.max(0, opts.discountCents ?? 0), subtotalCents + serviceFeeCents);
  return { subtotalCents, serviceFeeCents, discountCents, totalCents: subtotalCents + serviceFeeCents - discountCents };
}

export type TabKind = 'MESA' | 'COMANDA';
export const tabKindLabel = (kind: TabKind) => (kind === 'MESA' ? 'Mesa' : 'Comanda');
