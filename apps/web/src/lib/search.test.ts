import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MenuCategory, MenuProduct } from '@cardapio/shared';
import { filterMenu, normalize } from './search';

const product = (id: string, name: string, description: string | null = null): MenuProduct => ({
  id,
  name,
  description,
  priceCents: 1000,
  imageUrl: null,
  featured: false,
  optionGroups: [],
});

const menu: MenuCategory[] = [
  { id: 'c1', name: 'Lanches', products: [product('1', 'X-Burguer', 'Pão brioche e queijo'), product('2', 'X-Salada')] },
  { id: 'c2', name: 'Açaí', products: [product('3', 'Açaí 500 ml', 'Com granola')] },
  { id: 'c3', name: 'Bebidas', products: [product('4', 'Suco de laranja')] },
];

describe('busca no cardápio', () => {
  it('ignora acentos e maiúsculas', () => {
    assert.equal(normalize('  AÇAÍ  '), 'acai');
    assert.deepEqual(filterMenu(menu, 'acai').flatMap((c) => c.products.map((p) => p.id)), ['3']);
  });

  it('procura também na descrição e no nome da categoria', () => {
    assert.deepEqual(filterMenu(menu, 'queijo').flatMap((c) => c.products.map((p) => p.id)), ['1']);
    assert.deepEqual(filterMenu(menu, 'bebidas').flatMap((c) => c.products.map((p) => p.id)), ['4']);
  });

  it('exige todas as palavras e remove categorias vazias', () => {
    const result = filterMenu(menu, 'x salada');
    assert.deepEqual(result.map((c) => c.id), ['c1']);
    assert.deepEqual(result[0]!.products.map((p) => p.id), ['2']);
  });

  it('busca vazia devolve o cardápio inteiro', () => {
    assert.equal(filterMenu(menu, '   '), menu);
  });
});
