import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSalesReport, dayStart, isIsoDay, localDay, periodRange, type ReportOrder } from './report';

describe('dias no horário de Brasília', () => {
  it('23:30 em Brasília (02:30 UTC do dia seguinte) ainda é o mesmo dia', () => {
    assert.equal(localDay('2026-11-12T02:30:00Z'), '2026-11-11');
    assert.equal(localDay('2026-11-12T03:00:00Z'), '2026-11-12');
  });

  it('o dia começa às 03:00 UTC e o período inclui o último dia inteiro', () => {
    assert.equal(dayStart('2026-11-11').toISOString(), '2026-11-11T03:00:00.000Z');
    const r = periodRange('2026-11-01', '2026-11-30');
    assert.equal(r.days, 30);
    assert.equal(r.end.toISOString(), '2026-12-01T03:00:00.000Z');
  });

  it('valida datas', () => {
    assert.equal(isIsoDay('2026-02-28'), true);
    assert.equal(isIsoDay('2026-02-30'), false);
    assert.equal(isIsoDay('11/11/2026'), false);
  });
});

describe('buildSalesReport', () => {
  const item = (name: string, quantity: number, cents: number) => ({ name, quantity, cents });
  const order = (o: Partial<ReportOrder>): ReportOrder => ({
    type: 'retirada',
    status: 'COMPLETED',
    totalCents: 0,
    createdAt: '2026-11-10T15:00:00Z',
    tabId: null,
    paymentMethod: 'Pix',
    items: [],
    ...o,
  });

  const report = buildSalesReport({
    from: '2026-11-10',
    to: '2026-11-11',
    orders: [
      order({ totalCents: 5_000, paymentMethod: 'Dinheiro', items: [item('X-Burguer', 2, 5_000)] }),
      order({ type: 'delivery', totalCents: 3_000, createdAt: '2026-11-11T20:00:00Z', items: [item('Pizza', 1, 3_000)] }),
      // pedidos da mesa: entram em consumo e produtos, mas o recebimento é a conta fechada
      order({ type: 'mesa', tabId: 't1', paymentMethod: null, totalCents: 4_000, items: [item('X-Burguer', 1, 2_500), item('Chopp', 1, 1_500)] }),
      order({ status: 'CANCELED', totalCents: 9_900, items: [item('Pizza', 3, 9_900)] }),
    ],
    tabs: [
      {
        closedAt: '2026-11-11T01:00:00Z',
        totalCents: 4_200,
        serviceFeeCents: 400,
        discountCents: 200,
        payments: [
          { method: 'Cartão de crédito', amountCents: 3_000 },
          { method: 'Dinheiro', amountCents: 1_200 },
        ],
      },
    ],
  });

  it('faturamento = pedidos avulsos + contas fechadas; ticket médio por atendimento', () => {
    assert.equal(report.revenueCents, 5_000 + 3_000 + 4_200);
    assert.equal(report.receiptsCount, 3);
    assert.equal(report.averageTicketCents, Math.round(12_200 / 3));
    assert.equal(report.serviceFeeCents, 400);
    assert.equal(report.discountCents, 200);
  });

  it('cancelados ficam de fora e são mostrados à parte', () => {
    assert.equal(report.ordersCount, 3);
    assert.equal(report.canceledCount, 1);
    assert.equal(report.canceledCents, 9_900);
    assert.equal(report.topProducts.find((p) => p.name === 'Pizza')!.quantity, 1);
  });

  it('agrupa por dia local, tipo, pagamento e produto', () => {
    // conta fechada à 01:00 UTC do dia 11 = 22:00 do dia 10 em Brasília
    assert.deepEqual(report.byDay, [
      { day: '2026-11-10', cents: 9_200, count: 2 },
      { day: '2026-11-11', cents: 3_000, count: 1 },
    ]);
    assert.deepEqual(report.byType.map((t) => t.type), ['mesa', 'retirada', 'delivery']);
    assert.deepEqual(
      report.byPayment.map((p) => [p.method, p.cents]),
      [
        ['Pix', 3_000],
        ['Cartão de crédito', 3_000],
        ['Dinheiro', 6_200],
      ],
    );
    // a conta dividida em duas formas continua sendo um atendimento
    assert.equal(report.receiptsCount, 3);
    assert.deepEqual(report.topProducts[0], { name: 'X-Burguer', quantity: 3, cents: 7_500 });
  });

  it('período sem vendas: dias zerados e ticket 0', () => {
    const empty = buildSalesReport({ from: '2026-11-01', to: '2026-11-03', orders: [], tabs: [] });
    assert.equal(empty.byDay.length, 3);
    assert.equal(empty.averageTicketCents, 0);
  });
});
