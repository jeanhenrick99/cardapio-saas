import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { centsToInput, itemsSummary, orderTypeLabel, parseBRL, summarizeToday, timeAgo, waitingLevel } from './panel';

describe('timeAgo', () => {
  const now = new Date('2026-11-10T20:00:00Z').getTime();
  const ago = (seconds: number) => timeAgo(new Date(now - seconds * 1000).toISOString(), now);
  it('formata intervalos', () => {
    assert.equal(ago(10), 'agora');
    assert.equal(ago(3 * 60), 'há 3 min');
    assert.equal(ago(2 * 3600), 'há 2 h');
    assert.equal(ago(86400), 'há 1 dia');
    assert.equal(ago(3 * 86400), 'há 3 dias');
  });
});

describe('orderTypeLabel', () => {
  it('descreve o tipo do pedido', () => {
    assert.equal(orderTypeLabel({ type: 'mesa', table: '7' }), 'Mesa 7');
    assert.equal(orderTypeLabel({ type: 'delivery' }), 'Delivery');
    assert.equal(orderTypeLabel({ type: 'retirada' }), 'Retirada');
    assert.equal(orderTypeLabel({ type: 'comanda', table: '152' }), 'Comanda 152');
  });
});

describe('parseBRL', () => {
  it('aceita os formatos que o usuário digita', () => {
    assert.equal(parseBRL('30'), 3000);
    assert.equal(parseBRL('30,5'), 3050);
    assert.equal(parseBRL('R$ 1.234,56'), 123456);
    assert.equal(parseBRL(''), 0);
  });

  it('recusa valores inválidos', () => {
    assert.equal(parseBRL('abc'), null);
    assert.equal(parseBRL('30,555'), null);
    assert.equal(parseBRL('-5'), null);
  });

  it('volta para o formato do campo', () => {
    assert.equal(centsToInput(3000), '30,00');
    assert.equal(parseBRL(centsToInput(123456)), 123456);
  });
});

describe('summarizeToday', () => {
  const now = new Date(2026, 10, 10, 15, 0, 0); // 10/11/2026 15:00 (horário local)
  const at = (h: number, day = 10) => new Date(2026, 10, day, h, 0, 0).toISOString();

  it('conta só os pedidos de hoje e calcula faturamento e ticket médio', () => {
    const orders = [
      { createdAt: at(9), totalCents: 3000 },
      { createdAt: at(14), totalCents: 4500 },
      { createdAt: at(23, 9), totalCents: 9999 }, // ontem
    ];
    assert.deepEqual(summarizeToday(orders, now), { count: 2, revenueCents: 7500, averageCents: 3750 });
  });

  it('sem pedidos hoje, tudo zerado', () => {
    assert.deepEqual(summarizeToday([], now), { count: 0, revenueCents: 0, averageCents: 0 });
  });
});

describe('waitingLevel e itemsSummary', () => {
  const now = new Date('2026-11-11T20:00:00Z').getTime();
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();

  it('alerta aos 30 min e atraso aos 45 min', () => {
    assert.deepEqual(waitingLevel(ago(10), now), { minutes: 10, level: 'ok' });
    assert.deepEqual(waitingLevel(ago(30), now), { minutes: 30, level: 'warn' });
    assert.deepEqual(waitingLevel(ago(50), now), { minutes: 50, level: 'late' });
  });

  it('resume os itens', () => {
    assert.equal(itemsSummary([{ quantity: 2, name: 'X-Burguer' }, { quantity: 1, name: 'Coca' }]), '2x X-Burguer, 1x Coca');
  });
});
