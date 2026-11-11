import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MenuProduct } from '@cardapio/shared';
import { buildLine } from './cart';
import type { AdminCategory } from './menu-editor';
import { buildPdvCheckout, emptyPdvForm, isQuickAdd, toPdvCategories } from './pdv';

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

describe('PDV: comanda e cardápio da equipe', () => {
  it('comanda precisa do número e não manda cliente', () => {
    assert.deepEqual(buildPdvCheckout(lines, emptyPdvForm('comanda')).errors, ['Informe o número da comanda.']);
    const { checkout } = buildPdvCheckout(lines, { ...emptyPdvForm('comanda'), table: '152' });
    assert.equal(checkout?.table, '152');
    assert.equal(checkout?.customer, undefined);
  });

  it('esgotados aparecem marcados; categorias ocultas e opções esgotadas saem', () => {
    const admin: AdminCategory[] = [
      {
        id: 'c1', name: 'Lanches', position: 0, active: true,
        products: [
          { id: 'p1', categoryId: 'c1', name: 'Burger', description: null, priceCents: 2500, sector: 'cozinha', position: 0, active: false, featured: false, imageUrl: null,
            optionGroups: [{ id: 'g', name: 'Adicionais', minSelect: 0, maxSelect: 2, position: 0, options: [
              { id: 'o1', name: 'Bacon', priceCents: 400, active: true, position: 0 },
              { id: 'o2', name: 'Ovo', priceCents: 300, active: false, position: 1 },
            ] }] },
        ],
      },
      { id: 'c2', name: 'Oculta', position: 1, active: false, products: [] },
    ];
    const result = toPdvCategories(admin);
    assert.deepEqual(result.map((c) => c.name), ['Lanches']);
    assert.equal(result[0]!.products[0]!.soldOut, true);
    assert.deepEqual(result[0]!.products[0]!.optionGroups[0]!.options.map((o) => o.name), ['Bacon']);
  });
});
