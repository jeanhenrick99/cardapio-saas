import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CheckoutSchema } from './menu';
import { tabTotals } from './tab';

describe('tabTotals', () => {
  it('soma a taxa de serviço e desconta o desconto', () => {
    assert.deepEqual(tabTotals(10_000, { serviceFeePercent: 10, applyServiceFee: true, discountCents: 500 }), {
      subtotalCents: 10_000,
      serviceFeeCents: 1_000,
      discountCents: 500,
      totalCents: 10_500,
    });
  });

  it('sem taxa quando o cliente não aceita', () => {
    assert.equal(tabTotals(10_000, { serviceFeePercent: 10, applyServiceFee: false }).totalCents, 10_000);
  });

  it('arredonda a taxa para o centavo e nunca fica negativo', () => {
    assert.equal(tabTotals(3_333, { serviceFeePercent: 10, applyServiceFee: true }).serviceFeeCents, 333);
    assert.equal(tabTotals(1_000, { serviceFeePercent: 10, applyServiceFee: false, discountCents: 99_999 }).totalCents, 0);
  });
});

describe('checkout de comanda', () => {
  const items = [{ productId: '3f2a1b4c-1d2e-4f5a-8b9c-0d1e2f3a4b5c', quantity: 1 }];
  it('precisa do número e não pede cliente', () => {
    assert.ok(!CheckoutSchema.safeParse({ type: 'comanda', items }).success);
    assert.ok(CheckoutSchema.safeParse({ type: 'comanda', table: '152', items }).success);
  });
});
