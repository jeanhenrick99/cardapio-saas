import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { CheckoutSchema, OrderSchema, orderTotalCents, type CheckoutInput } from '@cardapio/shared';
import { buildOrderDraft, CheckoutError, type PricingProduct } from './pricing';

const id = () => randomUUID();
const ids = { burger: id(), soda: id(), point: id(), rare: id(), well: id(), extras: id(), bacon: id(), egg: id(), cheese: id() };

const burger: PricingProduct = {
  id: ids.burger,
  name: 'X-Burguer',
  priceCents: 2500,
  sector: 'cozinha',
  active: true,
  categoryActive: true,
  optionGroups: [
    {
      id: ids.point,
      name: 'Ponto da carne',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: ids.rare, name: 'Mal passado', priceCents: 0, active: true },
        { id: ids.well, name: 'Bem passado', priceCents: 0, active: true },
      ],
    },
    {
      id: ids.extras,
      name: 'Adicionais',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: ids.bacon, name: 'Bacon', priceCents: 400, active: true },
        { id: ids.egg, name: 'Ovo', priceCents: 300, active: true },
        { id: ids.cheese, name: 'Cheddar', priceCents: 500, active: false },
      ],
    },
  ],
};
const soda: PricingProduct = { id: ids.soda, name: 'Refrigerante', priceCents: 700, sector: 'bar', active: true, categoryActive: true, optionGroups: [] };
const menu = new Map([burger, soda].map((p) => [p.id, p]));

const checkout = (items: CheckoutInput['items'], extra: Partial<CheckoutInput> = {}) =>
  CheckoutSchema.parse({ type: 'mesa', table: '5', items, ...extra });

const fails = (input: ReturnType<typeof checkout>, message: RegExp, products = menu) =>
  assert.throws(() => buildOrderDraft(input, products), (err: unknown) => err instanceof CheckoutError && message.test(err.message));

describe('buildOrderDraft', () => {
  it('monta o pedido com os preços do banco, setor e complementos', () => {
    const draft = buildOrderDraft(
      checkout([
        { productId: ids.burger, quantity: 2, optionIds: [ids.rare, ids.bacon, ids.egg], notes: 'Sem cebola' },
        { productId: ids.soda, quantity: 1 },
      ]),
      menu,
    );
    const order = OrderSchema.parse({ ...draft, id: 'o', number: 1, createdAt: new Date().toISOString() });
    // (25 + 4 + 3) * 2 + 7 = 71
    assert.equal(orderTotalCents(order), 7100);
    assert.deepEqual(order.items[0]?.options.map((o) => o.name), ['Mal passado', 'Bacon', 'Ovo']);
    assert.equal(order.items[0]?.sector, 'cozinha');
    assert.equal(order.items[1]?.sector, 'bar');
    assert.equal(order.items[0]?.notes, 'Sem cebola');
    assert.equal(order.table, '5');
  });

  it('ignora qualquer preço enviado pelo cliente', () => {
    const tampered = checkout([{ productId: ids.soda, quantity: 1 }]);
    (tampered.items[0] as Record<string, unknown>).unitPriceCents = 1;
    const draft = buildOrderDraft(tampered, menu);
    assert.equal(draft.items[0]?.unitPriceCents, 700);
  });

  it('exige o mínimo de escolhas do grupo', () => {
    fails(checkout([{ productId: ids.burger, quantity: 1 }]), /pelo menos 1 em "Ponto da carne"/);
  });

  it('respeita o máximo de escolhas do grupo', () => {
    fails(checkout([{ productId: ids.burger, quantity: 1, optionIds: [ids.rare, ids.well] }]), /no máximo 1 em "Ponto da carne"/);
  });

  it('recusa opção desativada', () => {
    fails(checkout([{ productId: ids.burger, quantity: 1, optionIds: [ids.rare, ids.cheese] }]), /"Cheddar" está indisponível/);
  });

  it('recusa opção de outro produto', () => {
    fails(checkout([{ productId: ids.soda, quantity: 1, optionIds: [ids.bacon] }]), /não pertence/);
  });

  it('recusa opção repetida', () => {
    fails(checkout([{ productId: ids.burger, quantity: 1, optionIds: [ids.rare, ids.bacon, ids.bacon] }]), /repetida/);
  });

  it('recusa produto inexistente, desativado ou de categoria desativada', () => {
    fails(checkout([{ productId: id(), quantity: 1 }]), /indisponível/);
    fails(checkout([{ productId: ids.soda, quantity: 1 }]), /indisponível/, new Map([[ids.soda, { ...soda, active: false }]]));
    fails(checkout([{ productId: ids.soda, quantity: 1 }]), /indisponível/, new Map([[ids.soda, { ...soda, categoryActive: false }]]));
  });
});

describe('CheckoutSchema', () => {
  it('mesa exige número da mesa', () => {
    assert.ok(!CheckoutSchema.safeParse({ type: 'mesa', items: [{ productId: ids.soda, quantity: 1 }] }).success);
  });

  it('delivery exige endereço e telefone', () => {
    const base = { type: 'delivery', items: [{ productId: ids.soda, quantity: 1 }] };
    assert.ok(!CheckoutSchema.safeParse({ ...base, customer: { name: 'Ana' } }).success);
    assert.ok(CheckoutSchema.safeParse({ ...base, customer: { name: 'Ana', phone: '11 99999-0000', address: 'Rua A, 1' } }).success);
  });

  it('limita a quantidade por item', () => {
    assert.ok(!CheckoutSchema.safeParse({ type: 'mesa', table: '1', items: [{ productId: ids.soda, quantity: 500 }] }).success);
  });
});
