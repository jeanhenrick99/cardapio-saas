import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MenuProduct } from '@cardapio/shared';
import { buildLine } from './cart';
import { buildPdvCheckout, emptyPdvForm, isQuickAdd } from './pdv';

const coca: MenuProduct = { id: 'p1', name: 'Coca', description: null, priceCents: 700, imageUrl: null, featured: false, optionGroups: [] };
const burger: MenuProduct = {
  ...coca,
  id: 'p2',
  name: 'Burger',
  optionGroups: [{ id: 'g', name: 'Ponto', minSelect: 1, maxSelect: 1, options: [{ id: 'o', name: 'Ao ponto', priceCents: 0 }] }],
};
const lines = [buildLine(coca, new Set(), 2)];

describe('PDV', () => {
  it('produto sem complementos entra com um toque', () => {
    assert.ok(isQuickAdd(coca));
    assert.ok(!isQuickAdd(burger));
  });

  it('mesa: precisa do número; não manda dados de cliente', () => {
    assert.deepEqual(buildPdvCheckout(lines, emptyPdvForm('mesa')).errors, ['Informe o número da mesa.']);
    const { checkout } = buildPdvCheckout(lines, { ...emptyPdvForm('mesa'), table: ' 7 ', name: 'ignorado' });
    assert.equal(checkout?.table, '7');
    assert.equal(checkout?.customer, undefined);
    assert.deepEqual(checkout?.items, [{ productId: 'p1', quantity: 2, optionIds: [] }]);
  });

  it('delivery: precisa de nome, telefone e endereço', () => {
    const { errors } = buildPdvCheckout(lines, emptyPdvForm('delivery'));
    assert.deepEqual(errors, ['Informe o nome do cliente.', 'Informe o telefone para o delivery.', 'Informe o endereço de entrega.']);
    const { checkout } = buildPdvCheckout(lines, {
      ...emptyPdvForm('delivery'),
      name: 'Ana',
      phone: '11 98888-1111',
      address: 'Rua A, 1',
      notes: ' troco para 50 ',
    });
    assert.deepEqual(checkout?.customer, { name: 'Ana', phone: '11 98888-1111', address: 'Rua A, 1' });
    assert.equal(checkout?.notes, 'troco para 50');
  });

  it('retirada: só o nome é obrigatório e não manda endereço', () => {
    const { checkout } = buildPdvCheckout(lines, { ...emptyPdvForm('retirada'), name: 'Carlos', address: 'não vai' });
    assert.deepEqual(checkout?.customer, { name: 'Carlos' });
  });

  it('pedido vazio não é lançado', () => {
    assert.ok(buildPdvCheckout([], { ...emptyPdvForm('mesa'), table: '1' }).errors.includes('Adicione pelo menos um produto.'));
  });
});
