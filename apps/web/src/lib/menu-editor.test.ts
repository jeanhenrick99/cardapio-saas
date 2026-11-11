import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyGroup,
  emptyOption,
  emptyProductForm,
  knownSectors,
  moveItem,
  productToForm,
  validateProductForm,
  type AdminProduct,
  type ProductForm,
} from './menu-editor';

const valid = (): ProductForm => ({
  ...emptyProductForm('cat-1'),
  name: '  X-Burguer ',
  price: '25,90',
  sector: ' Cozinha ',
  groups: [
    {
      ...emptyGroup(),
      name: 'Ponto',
      min: '1',
      max: '1',
      options: [
        { ...emptyOption(), name: 'Mal passado' },
        { ...emptyOption(), name: 'Bem passado' },
      ],
    },
  ],
});

describe('validateProductForm', () => {
  it('monta o corpo da API em centavos, sem espaços e com setor em minúsculas', () => {
    const { body, errors } = validateProductForm(valid());
    assert.deepEqual(errors, []);
    assert.equal(body?.name, 'X-Burguer');
    assert.equal(body?.priceCents, 2590);
    assert.equal(body?.sector, 'cozinha');
    assert.equal(body?.description, null);
    assert.equal(body?.imageUrl, null);
    assert.deepEqual(body?.optionGroups[0], {
      name: 'Ponto',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Mal passado', priceCents: 0, active: true },
        { name: 'Bem passado', priceCents: 0, active: true },
      ],
    });
  });

  it('exige nome, preço e setor', () => {
    const { body, errors } = validateProductForm({ ...valid(), name: ' ', price: '', sector: '' });
    assert.equal(body, null);
    assert.equal(errors.length, 3);
  });

  it('valida as regras dos grupos como o servidor', () => {
    const form = valid();
    form.groups[0] = { ...form.groups[0]!, min: '3', max: '2' };
    const { errors } = validateProductForm(form);
    assert.ok(errors.some((e) => e.includes('mínimo não pode ser maior')));
    assert.ok(errors.some((e) => e.includes('maior que o número de opções')));
  });

  it('recusa grupo sem opções, opção sem nome e preço inválido', () => {
    const form = valid();
    form.groups.push({ ...emptyGroup(), name: 'Vazio', options: [] });
    form.groups[0]!.options[0] = { ...form.groups[0]!.options[0]!, name: '', price: 'abc' };
    const { errors } = validateProductForm(form);
    assert.ok(errors.some((e) => e.includes('"Vazio": adicione pelo menos uma opção')));
    assert.ok(errors.some((e) => e.includes('opção 1 está sem nome')));
    assert.ok(errors.some((e) => e.includes('preço inválido')));
  });

  it('valida o link da foto', () => {
    assert.ok(validateProductForm({ ...valid(), imageUrl: 'foto.jpg' }).errors.length > 0);
    assert.equal(validateProductForm({ ...valid(), imageUrl: 'https://exemplo.com/a.jpg' }).body?.imageUrl, 'https://exemplo.com/a.jpg');
    const uploaded = '/api/images/3f2a1b4c-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
    assert.equal(validateProductForm({ ...valid(), imageUrl: uploaded }).body?.imageUrl, uploaded);
  });
});

describe('productToForm', () => {
  it('faz o caminho de volta: produto → formulário → mesmo corpo', () => {
    const product: AdminProduct = {
      id: 'p1',
      categoryId: 'c1',
      name: 'Pizza',
      description: 'Grande',
      priceCents: 5900,
      sector: 'cozinha',
      position: 2,
      active: false,
      featured: true,
      imageUrl: null,
      optionGroups: [
        { id: 'g', name: 'Sabores', minSelect: 1, maxSelect: 2, position: 0, options: [
          { id: 'o1', name: 'Calabresa', priceCents: 0, active: true, position: 0 },
          { id: 'o2', name: 'Quatro queijos', priceCents: 500, active: false, position: 1 },
        ] },
      ],
    };
    const { body } = validateProductForm(productToForm(product));
    assert.equal(body?.priceCents, 5900);
    assert.equal(body?.position, 2);
    assert.equal(body?.active, false);
    assert.equal(body?.featured, true);
    assert.deepEqual(body?.optionGroups[0]?.options.map((o) => [o.priceCents, o.active]), [[0, true], [500, false]]);
  });
});

describe('utilitários', () => {
  it('moveItem troca de lugar e ignora os limites', () => {
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  });

  it('knownSectors junta os setores usados com os padrões', () => {
    const cats = [{ id: 'c', name: 'C', position: 0, active: true, products: [{ sector: 'sobremesas' } as AdminProduct] }];
    assert.deepEqual(knownSectors(cats), ['bar', 'cozinha', 'sobremesas']);
  });
});
