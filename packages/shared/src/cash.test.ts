import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cashSummary } from './cash';
import { totalsByPayment } from './payment';

describe('totalsByPayment', () => {
  it('agrupa na ordem do PDV e trata forma vazia como "Não informado"', () => {
    const totals = totalsByPayment([
      { paymentMethod: 'Dinheiro', amountCents: 1000 },
      { paymentMethod: 'Pix', amountCents: 2000 },
      { paymentMethod: 'Dinheiro', amountCents: 500 },
      { paymentMethod: null, amountCents: 300 },
      { paymentMethod: 'Vale-refeição', amountCents: 900 },
    ]);
    assert.deepEqual(
      totals.map((t) => [t.method, t.count, t.cents]),
      [
        ['Pix', 1, 2000],
        ['Dinheiro', 2, 1500],
        ['Vale-refeição', 1, 900],
        ['Não informado', 1, 300],
      ],
    );
  });
});

describe('cashSummary', () => {
  const base = {
    openingCents: 10_000, // R$ 100 de troco
    receipts: [
      { paymentMethod: 'Dinheiro', amountCents: 4_500 },
      { paymentMethod: 'Pix', amountCents: 3_000 },
      { paymentMethod: 'Dinheiro', amountCents: 1_500 },
    ],
    movements: [
      { kind: 'SANGRIA' as const, amountCents: 5_000 },
      { kind: 'SUPRIMENTO' as const, amountCents: 2_000 },
    ],
  };

  it('dinheiro esperado = troco + vendas em dinheiro + suprimento − sangria (Pix não entra na gaveta)', () => {
    const s = cashSummary(base);
    assert.equal(s.salesCents, 9_000);
    assert.equal(s.salesCount, 3);
    assert.equal(s.cashSalesCents, 6_000);
    assert.equal(s.expectedCashCents, 10_000 + 6_000 + 2_000 - 5_000);
    assert.equal(s.differenceCents, null);
  });

  it('diferença: falta é negativa, sobra é positiva', () => {
    assert.equal(cashSummary({ ...base, countedCents: 12_500 }).differenceCents, -500);
    assert.equal(cashSummary({ ...base, countedCents: 13_200 }).differenceCents, 200);
    assert.equal(cashSummary({ ...base, countedCents: 13_000 }).differenceCents, 0);
  });

  it('caixa sem movimento: esperado é o troco', () => {
    const s = cashSummary({ openingCents: 5_000, receipts: [], movements: [] });
    assert.equal(s.expectedCashCents, 5_000);
    assert.deepEqual(s.byPayment, []);
  });
});
