import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { centsToInput, orderTypeLabel, parseBRL, timeAgo } from './panel';

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
