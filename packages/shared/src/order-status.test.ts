import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { advanceLabel, canTransition, nextStatus, previousStatus, statusFlow, statusLabel } from './order-status';

describe('fluxo do pedido', () => {
  it('delivery passa por "saiu para entrega"; retirada e mesa não', () => {
    assert.deepEqual(statusFlow('delivery'), ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']);
    assert.ok(!statusFlow('retirada').includes('OUT_FOR_DELIVERY'));
    assert.equal(nextStatus('retirada', 'READY'), 'COMPLETED');
    assert.equal(nextStatus('delivery', 'READY'), 'OUT_FOR_DELIVERY');
  });

  it('avança ou volta uma etapa, nunca pula', () => {
    assert.ok(canTransition('delivery', 'RECEIVED', 'PREPARING'));
    assert.ok(canTransition('delivery', 'PREPARING', 'RECEIVED'));
    assert.ok(!canTransition('delivery', 'RECEIVED', 'READY'));
    assert.ok(!canTransition('retirada', 'READY', 'OUT_FOR_DELIVERY'));
    assert.ok(!canTransition('delivery', 'READY', 'READY'));
  });

  it('cancelamento: permitido até concluir e definitivo', () => {
    assert.ok(canTransition('delivery', 'OUT_FOR_DELIVERY', 'CANCELED'));
    assert.ok(!canTransition('delivery', 'COMPLETED', 'CANCELED'));
    assert.ok(!canTransition('delivery', 'CANCELED', 'RECEIVED'));
  });

  it('primeira e última etapa', () => {
    assert.equal(previousStatus('delivery', 'RECEIVED'), null);
    assert.equal(nextStatus('delivery', 'COMPLETED'), null);
  });

  it('nomes conforme o tipo do pedido', () => {
    assert.equal(statusLabel('COMPLETED', 'delivery'), 'Entregue');
    assert.equal(statusLabel('COMPLETED', 'retirada'), 'Retirado');
    assert.equal(statusLabel('READY', 'retirada'), 'Pronto para retirar');
    assert.equal(statusLabel('PREPARING'), 'Em preparo');
    assert.equal(advanceLabel('delivery', 'OUT_FOR_DELIVERY'), 'Confirmar entrega');
    assert.equal(advanceLabel('retirada', 'READY'), 'Confirmar retirada');
    assert.equal(advanceLabel('delivery', 'COMPLETED'), null);
  });
});
