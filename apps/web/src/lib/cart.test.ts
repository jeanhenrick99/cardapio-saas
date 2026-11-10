import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MenuOptionGroup, MenuProduct } from '@cardapio/shared';
import {
  addLine,
  buildLine,
  cartCount,
  cartTotalCents,
  groupHint,
  missingGroups,
  parseStoredLines,
  reconcileLines,
  setQuantity,
  startingPriceCents,
  toCheckoutItems,
  toggleOption,
} from './cart';

const point: MenuOptionGroup = {
  id: 'g1',
  name: 'Ponto',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { id: 'rare', name: 'Mal passado', priceCents: 0 },
    { id: 'well', name: 'Bem passado', priceCents: 0 },
  ],
};
const extras: MenuOptionGroup = {
  id: 'g2',
  name: 'Adicionais',
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'bacon', name: 'Bacon', priceCents: 400 },
    { id: 'egg', name: 'Ovo', priceCents: 300 },
    { id: 'cheddar', name: 'Cheddar', priceCents: 500 },
  ],
};
const burger: MenuProduct = { id: 'p1', name: 'X-Burguer', description: null, priceCents: 2500, optionGroups: [point, extras] };

describe('toggleOption', () => {
  it('grupo de escolha única funciona como rádio', () => {
    let s = toggleOption(point, new Set(), 'rare');
    s = toggleOption(point, s, 'well');
    assert.deepEqual([...s], ['well']);
  });

  it('respeita o máximo do grupo', () => {
    let s = new Set<string>();
    for (const id of ['bacon', 'egg', 'cheddar']) s = toggleOption(extras, s, id);
    assert.deepEqual([...s].sort(), ['bacon', 'egg']);
  });

  it('clicar de novo desmarca', () => {
    const s = toggleOption(extras, new Set(['bacon']), 'bacon');
    assert.equal(s.size, 0);
  });
});

describe('regras e textos', () => {
  it('aponta os grupos obrigatórios pendentes', () => {
    assert.deepEqual(missingGroups(burger, new Set()).map((g) => g.name), ['Ponto']);
    assert.deepEqual(missingGroups(burger, new Set(['rare'])), []);
  });

  it('descreve cada grupo', () => {
    assert.equal(groupHint(point), 'Obrigatório · escolha 1');
    assert.equal(groupHint(extras), 'Opcional · até 2');
    assert.equal(groupHint({ ...extras, minSelect: 1 }), 'Obrigatório · de 1 a 2');
    assert.equal(groupHint({ ...extras, maxSelect: 1 }), 'Opcional');
  });
});

describe('carrinho', () => {
  it('soma preço base, adicionais e quantidade', () => {
    const line = buildLine(burger, new Set(['rare', 'bacon', 'egg']), 2);
    assert.equal(cartTotalCents([line]), (2500 + 400 + 300) * 2);
  });

  it('junta itens iguais e separa itens com observação diferente', () => {
    let lines = addLine([], buildLine(burger, new Set(['rare', 'bacon']), 1));
    lines = addLine(lines, buildLine(burger, new Set(['bacon', 'rare']), 2));
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.quantity, 3);

    lines = addLine(lines, buildLine(burger, new Set(['rare', 'bacon']), 1, 'sem cebola'));
    assert.equal(lines.length, 2);
    assert.equal(cartCount(lines), 4);
  });

  it('quantidade zero remove a linha', () => {
    const line = buildLine(burger, new Set(['rare']), 1);
    assert.deepEqual(setQuantity([line], line.key, 0), []);
  });

  it('envia só IDs e quantidades para a API', () => {
    const items = toCheckoutItems([buildLine(burger, new Set(['rare', 'bacon']), 2, '  bem quente ')]);
    assert.deepEqual(items, [{ productId: 'p1', quantity: 2, optionIds: ['rare', 'bacon'], notes: 'bem quente' }]);
    assert.ok(!JSON.stringify(items).includes('Cents'));
  });
});

describe('preço inicial e carrinho salvo', () => {
  it('"a partir de" soma as opções mais baratas dos grupos obrigatórios', () => {
    const pizza: MenuProduct = {
      ...burger,
      priceCents: 5900,
      optionGroups: [{ ...extras, minSelect: 1, maxSelect: 2 }],
    };
    assert.equal(startingPriceCents(pizza), 5900 + 300);
    assert.equal(startingPriceCents(burger), 2500);
  });

  it('remove itens que saíram do cardápio e atualiza preços', () => {
    const line = buildLine(burger, new Set(['rare', 'bacon']), 1);
    const gone = buildLine({ ...burger, id: 'p-removido' }, new Set(['rare']), 1);
    const newMenu = {
      categories: [
        {
          products: [
            {
              ...burger,
              priceCents: 2800,
              optionGroups: [point, { ...extras, options: [{ id: 'bacon', name: 'Bacon', priceCents: 500 }] }],
            },
          ],
        },
      ],
    };
    const result = reconcileLines([line, gone], newMenu);
    assert.equal(result.length, 1);
    assert.equal(cartTotalCents(result), 2800 + 500);
  });

  it('ignora dados corrompidos do armazenamento', () => {
    assert.deepEqual(parseStoredLines('lixo'), []);
    assert.deepEqual(parseStoredLines([{ foo: 1 }, null]), []);
  });
});
