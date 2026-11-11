import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CheckoutSchema } from './menu';
import { checkPayments, paymentsLabel, splitEvenly, tabTotals } from './tab';

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

describe('dividir a conta', () => {
  it('divide em partes iguais e distribui os centavos que sobram', () => {
    assert.deepEqual(splitEvenly(10_000, 3), [3_334, 3_333, 3_333]);
    assert.deepEqual(splitEvenly(10_001, 2), [5_001, 5_000]);
    assert.deepEqual(splitEvenly(500, 1), [500]);
    assert.equal(splitEvenly(12_345, 7).reduce((a, b) => a + b, 0), 12_345);
  });

  it('pagamentos precisam fechar o total exato', () => {
    assert.equal(checkPayments(5_000, [{ method: 'Pix', amountCents: 3_000 }, { method: 'Dinheiro', amountCents: 2_000 }]).ok, true);
    assert.deepEqual(checkPayments(5_000, [{ method: 'Pix', amountCents: 3_000 }]), { paidCents: 3_000, remainingCents: 2_000, ok: false });
    assert.equal(checkPayments(5_000, [{ method: 'Pix', amountCents: 6_000 }]).ok, false);
    assert.equal(checkPayments(5_000, [{ method: 'Pix', amountCents: 5_000 }, { method: 'Pix', amountCents: 0 }]).ok, false);
    assert.equal(checkPayments(0, []).ok, true);
    assert.equal(checkPayments(100, []).ok, false);
  });

  it('rótulo junta as formas sem repetir', () => {
    assert.equal(paymentsLabel([{ method: 'Pix' }, { method: 'Dinheiro' }, { method: 'Pix' }]), 'Pix + Dinheiro');
  });
});
