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

export interface TabPaymentInput {
  method: string;
  amountCents: number;
}

/**
 * Divide o total em N partes iguais, em centavos. Os centavos que sobram vão
 * para as primeiras partes: R$ 100,00 em 3 = 33,34 + 33,33 + 33,33.
 */
export function splitEvenly(totalCents: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Confere os pagamentos da conta: precisam somar exatamente o total, cada um com valor positivo.
 * Conta de total zero (tudo cancelado, desconto integral) fecha sem pagamento.
 */
export function checkPayments(totalCents: number, payments: TabPaymentInput[]) {
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const remainingCents = totalCents - paidCents;
  const invalid = payments.some((p) => !p.method.trim() || !Number.isInteger(p.amountCents) || p.amountCents <= 0);
  return { paidCents, remainingCents, ok: !invalid && remainingCents === 0 && (payments.length > 0 || totalCents === 0) };
}

/** Rótulo curto das formas usadas: "Pix" ou "Pix + Dinheiro". */
export function paymentsLabel(payments: { method: string }[]): string {
  return [...new Set(payments.map((p) => p.method.trim()))].join(' + ');
}
