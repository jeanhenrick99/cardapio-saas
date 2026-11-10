/**
 * Testes de integração do cardápio e do pedido público.
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PublicMenu } from '@cardapio/shared';
import { buildApp } from '../app';
import { prisma } from '../db';
import { auth, createSimpleProduct, signup, tableOrder } from '../test/helpers';

let app: FastifyInstance;
before(async () => {
  app = await buildApp({ logger: false });
});
after(async () => {
  await app.close();
});

type Owner = Awaited<ReturnType<typeof signup>>;

async function createBurger(owner: Owner) {
  const category = (
    await app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/categories`, headers: auth(owner.token), payload: { name: 'Lanches' } })
  ).json<{ id: string }>();
  const res = await app.inject({
    method: 'POST',
    url: `/restaurants/${owner.slug}/products`,
    headers: auth(owner.token),
    payload: {
      categoryId: category.id,
      name: 'X-Burguer',
      priceCents: 2500,
      optionGroups: [
        { name: 'Ponto', minSelect: 1, maxSelect: 1, options: [{ name: 'Mal passado' }, { name: 'Bem passado' }] },
        { name: 'Adicionais', minSelect: 0, maxSelect: 2, options: [{ name: 'Bacon', priceCents: 400 }, { name: 'Ovo', priceCents: 300 }] },
      ],
    },
  });
  assert.equal(res.statusCode, 201, res.body);
  const product = res.json<{ id: string; optionGroups: { options: { id: string; name: string }[] }[] }>();
  const opt = (name: string) => product.optionGroups.flatMap((g) => g.options).find((o) => o.name === name)!.id;
  return { categoryId: category.id, productId: product.id, opt };
}

describe('gestão do cardápio', () => {
  it('cria produto com complementos na ordem enviada', async () => {
    const owner = await signup(app);
    await createBurger(owner);
    const menu = (await app.inject({ url: `/restaurants/${owner.slug}/menu`, headers: auth(owner.token) })).json<
      { products: { optionGroups: { name: string; position: number; options: { name: string }[] }[] }[] }[]
    >();
    const groups = menu[0]!.products[0]!.optionGroups;
    assert.deepEqual(groups.map((g) => g.name), ['Ponto', 'Adicionais']);
    assert.deepEqual(groups[1]!.options.map((o) => o.name), ['Bacon', 'Ovo']);
  });

  it('valida mínimo e máximo dos grupos', async () => {
    const owner = await signup(app);
    const { categoryId } = await createBurger(owner);
    const res = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/products`,
      headers: auth(owner.token),
      payload: { categoryId, name: 'X', priceCents: 100, optionGroups: [{ name: 'G', minSelect: 3, maxSelect: 2, options: [{ name: 'a' }] }] },
    });
    assert.equal(res.statusCode, 400);
  });

  it('PUT substitui o produto e seus complementos', async () => {
    const owner = await signup(app);
    const { categoryId, productId } = await createBurger(owner);
    const res = await app.inject({
      method: 'PUT',
      url: `/restaurants/${owner.slug}/products/${productId}`,
      headers: auth(owner.token),
      payload: { categoryId, name: 'X-Burguer duplo', priceCents: 3200, optionGroups: [] },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().name, 'X-Burguer duplo');
    assert.equal(res.json().optionGroups.length, 0);
    assert.equal(await prisma.option.count({ where: { group: { productId } } }), 0);
  });

  it('não apaga categoria com produtos', async () => {
    const owner = await signup(app);
    const { categoryId } = await createBurger(owner);
    const res = await app.inject({ method: 'DELETE', url: `/restaurants/${owner.slug}/categories/${categoryId}`, headers: auth(owner.token) });
    assert.equal(res.statusCode, 409);
  });

  it('um restaurante não mexe no cardápio de outro, mesmo sabendo os IDs', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const { categoryId, productId } = await createBurger(a);

    // B tenta usar a categoria de A no próprio restaurante
    const steal = await app.inject({
      method: 'POST',
      url: `/restaurants/${b.slug}/products`,
      headers: auth(b.token),
      payload: { categoryId, name: 'Invasor', priceCents: 1 },
    });
    assert.equal(steal.statusCode, 400);

    // B tenta editar/apagar o produto de A pelo próprio restaurante
    for (const req of [
      { method: 'PUT' as const, payload: { categoryId, name: 'Hack', priceCents: 1 } },
      { method: 'DELETE' as const },
    ]) {
      const res = await app.inject({ ...req, url: `/restaurants/${b.slug}/products/${productId}`, headers: auth(b.token) });
      assert.ok([400, 404].includes(res.statusCode), `${req.method} → ${res.statusCode}`);
    }
    const intact = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    assert.equal(intact.name, 'X-Burguer');
    assert.equal(intact.priceCents, 2500);
  });

  it('funcionário marca produto como esgotado, mas não edita o cardápio', async () => {
    const owner = await signup(app);
    const staff = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });
    const { productId } = await createBurger(owner);

    const soldOut = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/products/${productId}/availability`,
      headers: auth(staff.token),
      payload: { active: false },
    });
    assert.equal(soldOut.statusCode, 200);

    const edit = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/categories`,
      headers: auth(staff.token),
      payload: { name: 'Nova' },
    });
    assert.equal(edit.statusCode, 403);
  });
});

describe('cardápio público e pedido do cliente', () => {
  it('mostra só o que está ativo e esconde produto sem opção obrigatória disponível', async () => {
    const owner = await signup(app);
    const { productId, opt } = await createBurger(owner);
    const hiddenId = await createSimpleProduct(app, owner);
    await prisma.product.update({ where: { id: hiddenId }, data: { active: false } });
    await prisma.option.update({ where: { id: opt('Ovo') }, data: { active: false } });

    let menu = (await app.inject({ url: `/public/restaurants/${owner.slug}/menu` })).json<PublicMenu>();
    const products = menu.categories.flatMap((c) => c.products);
    assert.deepEqual(products.map((p) => p.id), [productId]);
    assert.deepEqual(products[0]!.optionGroups[1]!.options.map((o) => o.name), ['Bacon']);

    // Sem nenhum ponto da carne disponível, o X-Burguer não pode ser pedido: some do cardápio.
    await prisma.option.updateMany({ where: { id: { in: [opt('Mal passado'), opt('Bem passado')] } }, data: { active: false } });
    menu = (await app.inject({ url: `/public/restaurants/${owner.slug}/menu` })).json<PublicMenu>();
    assert.equal(menu.categories.length, 0);
  });

  it('o servidor calcula o total; preço enviado pelo cliente é ignorado', async () => {
    const owner = await signup(app);
    const { productId, opt } = await createBurger(owner);
    const res = await app.inject({
      method: 'POST',
      url: `/public/restaurants/${owner.slug}/orders`,
      payload: {
        type: 'mesa',
        table: '7',
        items: [{ productId, quantity: 2, optionIds: [opt('Mal passado'), opt('Bacon')], unitPriceCents: 1, priceCents: 1 }],
        totalCents: 1,
      },
    });
    assert.equal(res.statusCode, 201, res.body);
    // (25 + 4) * 2 = 58
    assert.equal(res.json().totalCents, 5800);
    assert.equal(res.json().number, 1);
    assert.equal(res.json().printJob, undefined, 'dados internos não vão para o cliente');
  });

  it('recusa carrinho que viola as regras do produto com 422', async () => {
    const owner = await signup(app);
    const { productId, opt } = await createBurger(owner);
    const order = (optionIds: string[]) =>
      app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: { ...tableOrder(productId), items: [{ productId, quantity: 1, optionIds }] } });

    const missing = await order([]);
    assert.equal(missing.statusCode, 422);
    assert.match(missing.json().error, /pelo menos 1 em "Ponto"/);

    const tooMany = await order([opt('Mal passado'), opt('Bem passado')]);
    assert.equal(tooMany.statusCode, 422);
  });

  it('não aceita produto de outro restaurante no carrinho', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const productOfA = await createSimpleProduct(app, a);
    await createSimpleProduct(app, b);
    const res = await app.inject({ method: 'POST', url: `/public/restaurants/${b.slug}/orders`, payload: tableOrder(productOfA) });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /indisponível/);
  });

  it('pedido de delivery exige endereço e telefone', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner);
    const res = await app.inject({
      method: 'POST',
      url: `/public/restaurants/${owner.slug}/orders`,
      payload: { type: 'delivery', customer: { name: 'Ana' }, items: [{ productId, quantity: 1 }] },
    });
    assert.equal(res.statusCode, 400);
  });

  it('restaurante inexistente responde 404', async () => {
    const res = await app.inject({ url: '/public/restaurants/nao-existe-xyz/menu' });
    assert.equal(res.statusCode, 404);
  });
});

describe('vitrine do restaurante', () => {
  it('dono configura tempos, mínimo e status; cardápio público mostra', async () => {
    const owner = await signup(app);
    await createSimpleProduct(app, owner);
    const res = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/settings`,
      headers: auth(owner.token),
      payload: { pickupMinutes: 20, deliveryMinutes: 50, minOrderCents: 2500 },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().lastOrderNumber, undefined);

    const menu = (await app.inject({ url: `/public/restaurants/${owner.slug}/menu` })).json<PublicMenu>();
    assert.deepEqual(
      { p: menu.restaurant.pickupMinutes, d: menu.restaurant.deliveryMinutes, m: menu.restaurant.minOrderCents, open: menu.restaurant.acceptingOrders },
      { p: 20, d: 50, m: 2500, open: true },
    );
    assert.equal(menu.categories[0]!.products[0]!.featured, false);
  });

  it('funcionário não altera as configurações', async () => {
    const owner = await signup(app);
    const staff = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/settings`,
      headers: auth(staff.token),
      payload: { acceptingOrders: false },
    });
    assert.equal(res.statusCode, 403);
  });

  it('restaurante fechado recusa pedidos e delivery respeita o mínimo', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner, 1000);
    const settings = (payload: object) =>
      app.inject({ method: 'PATCH', url: `/restaurants/${owner.slug}/settings`, headers: auth(owner.token), payload });
    const delivery = (quantity: number) =>
      app.inject({
        method: 'POST',
        url: `/public/restaurants/${owner.slug}/orders`,
        payload: { type: 'delivery', customer: { name: 'Ana', phone: '11 9', address: 'Rua A' }, items: [{ productId, quantity }] },
      });

    await settings({ acceptingOrders: false });
    const closed = await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: tableOrder(productId) });
    assert.equal(closed.statusCode, 422);
    assert.match(closed.json().error, /fechado/);

    await settings({ acceptingOrders: true, minOrderCents: 3000 });
    assert.equal((await delivery(2)).statusCode, 422);
    assert.equal((await delivery(3)).statusCode, 201);
  });

  it('produto em destaque e com foto aparece assim no cardápio público', async () => {
    const owner = await signup(app);
    const category = (
      await app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/categories`, headers: auth(owner.token), payload: { name: 'Pratos' } })
    ).json<{ id: string }>();
    const created = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/products`,
      headers: auth(owner.token),
      payload: { categoryId: category.id, name: 'Salmão', priceCents: 7900, featured: true, imageUrl: 'https://exemplo.com/salmao.jpg' },
    });
    assert.equal(created.statusCode, 201, created.body);
    const menu = (await app.inject({ url: `/public/restaurants/${owner.slug}/menu` })).json<PublicMenu>();
    const p = menu.categories[0]!.products[0]!;
    assert.equal(p.featured, true);
    assert.equal(p.imageUrl, 'https://exemplo.com/salmao.jpg');
  });
});
