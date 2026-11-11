import { CASH_METHOD, totalsByPayment, type PaymentTotal } from './payment';

export type CashMovementKind = 'SANGRIA' | 'SUPRIMENTO';

export const cashMovementLabel: Record<CashMovementKind, string> = {
  SANGRIA: 'Sangria',
  SUPRIMENTO: 'Suprimento',
};

export interface CashSummary {
  openingCents: number;
  byPayment: PaymentTotal[];
  /** Total vendido no caixa (todas as formas). */
  salesCents: number;
  salesCount: number;
  /** Vendas em dinheiro (entram na gaveta). */
  cashSalesCents: number;
  suprimentoCents: number;
  sangriaCents: number;
  /** Dinheiro que deveria estar na gaveta: troco + vendas em dinheiro + suprimentos − sangrias. */
  expectedCashCents: number;
  countedCents: number | null;
  /** Contado − esperado. Positivo = sobra, negativo = falta. */
  differenceCents: number | null;
}

/**
 * Resumo do caixa: vendas por forma de pagamento e conferência da gaveta.
 * Função pura, usada pela API (valor gravado no fechamento) e testada sem banco.
 */
export function cashSummary(input: {
  openingCents: number;
  receipts: { paymentMethod: string | null | undefined; amountCents: number }[];
  movements: { kind: CashMovementKind; amountCents: number }[];
  countedCents?: number | null;
}): CashSummary {
  const byPayment = totalsByPayment(input.receipts);
  const sum = (kind: CashMovementKind) => input.movements.filter((m) => m.kind === kind).reduce((s, m) => s + m.amountCents, 0);
  const suprimentoCents = sum('SUPRIMENTO');
  const sangriaCents = sum('SANGRIA');
  const cashSalesCents = byPayment.find((p) => p.method === CASH_METHOD)?.cents ?? 0;
  const expectedCashCents = input.openingCents + cashSalesCents + suprimentoCents - sangriaCents;
  const countedCents = input.countedCents ?? null;
  return {
    openingCents: input.openingCents,
    byPayment,
    salesCents: byPayment.reduce((s, p) => s + p.cents, 0),
    salesCount: byPayment.reduce((s, p) => s + p.count, 0),
    cashSalesCents,
    suprimentoCents,
    sangriaCents,
    expectedCashCents,
    countedCents,
    differenceCents: countedCents === null ? null : countedCents - expectedCashCents,
  };
}
