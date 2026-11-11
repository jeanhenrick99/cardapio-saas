/** Formas de pagamento oferecidas no PDV e no cardápio. */
export const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'] as const;

/** A única forma que entra na gaveta (e entra na conferência do caixa). */
export const CASH_METHOD = 'Dinheiro';

/** Rótulo para vendas sem forma de pagamento registrada. */
export const NO_PAYMENT_METHOD = 'Não informado';

export interface PaymentTotal {
  method: string;
  count: number;
  cents: number;
}

/** Soma recebimentos por forma de pagamento, na ordem do PDV (outras formas ao final, por valor). */
export function totalsByPayment(receipts: { paymentMethod: string | null | undefined; amountCents: number }[]): PaymentTotal[] {
  const map = new Map<string, PaymentTotal>();
  for (const r of receipts) {
    const method = r.paymentMethod?.trim() || NO_PAYMENT_METHOD;
    const entry = map.get(method) ?? { method, count: 0, cents: 0 };
    entry.count += 1;
    entry.cents += r.amountCents;
    map.set(method, entry);
  }
  const rank = (m: string) => {
    const i = (PAYMENT_METHODS as readonly string[]).indexOf(m);
    return i === -1 ? PAYMENT_METHODS.length : i;
  };
  return [...map.values()].sort((a, b) => rank(a.method) - rank(b.method) || b.cents - a.cents);
}
