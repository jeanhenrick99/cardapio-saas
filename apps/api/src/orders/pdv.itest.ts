/**
 * Testes de integração do PDV: pedidos lançados pela equipe e busca de cliente.
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma } from '../db';
import { auth, createSimpleProduct, signup } from '../test/helpers';

let app: FastifyInstance;
before(async () => {
  app = await buildApp({ logger: false });
});
after(async () => {
  await app.close();
});

const delivery = (productId: string, phone = '(11) 98888-1111', address = 'Rua das Acácias, 120') => ({
  type: 'delivery',
  customer: { name: 'Mariana Costa', phone, address },
  items: [{ productId, quantity: 1 }],
});

describe('pedido lançado no PDV', () => {
  it('fica marcado como PDV, com o nome de quem lançou', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner);
    const res = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/orders`,
      headers: auth(owner.token),
      payload: { type: 'mesa', table: '4', items: [{ productId, quantity: 2 }] },
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().order.origin, 'pdv');
    assert.equal(res.json().order.staffName, owner.name);

    const list = (await app.inject({ url: `/restaurants/${owner.slug}/orders`, headers: auth(owner.token) })).json<{ origin: string }[]>();
    assert.equal(list[0]?.origin, 'pdv');
  });

  it('pedido do cliente fica marcado como cardápio', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner);
    await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: { type: 'mesa', table: '1', items: [{ productId, quantity: 1 }] } });
    const list = (await app.inject({ url: `/restaurants/${owner.slug}/orders`, headers: auth(owner.token) })).json<{ origin: string; staffName?: string }[]>();
    assert.equal(list[0]?.origin, 'cardapio');
    assert.equal(list[0]?.staffName, undefined);
  });

  it('com a loja fechada e abaixo do mínimo: o PDV lança, o cardápio online não', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner, 1000);
    await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/settings`,
      headers: auth(owner.token),
      payload: { acceptingOrders: false, minOrderCents: 5000 },
    });

    const online = await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: delivery(productId) });
    assert.equal(online.statusCode, 422);

    const pdv = await app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/orders`, headers: auth(owner.token), payload: delivery(productId) });
    assert.equal(pdv.statusCode, 201, pdv.body);
  });

  it('o PDV continua cobrando o preço do cardápio', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner, 2500);
    const res = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/orders`,
      headers: auth(owner.token),
      payload: { type: 'mesa', table: '2', items: [{ productId, quantity: 2, unitPriceCents: 1 }] },
    });
    assert.equal(res.json().order.items[0].unitPriceCents, 2500);
  });
});

describe('busca de cliente pelo telefone', () => {
  it('encontra o cliente que já pediu, em qualquer formato de telefone', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner);
    await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: delivery(productId) });

    for (const phone of ['11988881111', '(11) 98888-1111', '+55 11 98888-1111']) {
      const res = await app.inject({
        url: `/restaurants/${owner.slug}/customers?phone=${encodeURIComponent(phone)}`,
        headers: auth(owner.token),
      });
      assert.equal(res.statusCode, 200, `${phone}: ${res.body}`);
      assert.equal(res.json().name, 'Mariana Costa');
      assert.equal(res.json().address, 'Rua das Acácias, 120');
      assert.equal(res.json().orders, 1);
    }
  });

  it('usa o último endereço conhecido, mesmo se o último pedido foi retirada', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner);
    await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: delivery(productId) });
    await app.inject({
      method: 'POST',
      url: `/public/restaurants/${owner.slug}/orders`,
      payload: { type: 'retirada', customer: { name: 'Mariana C.', phone: '11 98888-1111' }, items: [{ productId, quantity: 1 }] },
    });
    const res = await app.inject({ url: `/restaurants/${owner.slug}/customers?phone=11988881111`, headers: auth(owner.token) });
    assert.equal(res.json().name, 'Mariana C.');
    assert.equal(res.json().address, 'Rua das Acácias, 120');
    assert.equal(res.json().orders, 2);
  });

  it('cliente de outro restaurante não aparece (404)', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const productId = await createSimpleProduct(app, a);
    await app.inject({ method: 'POST', url: `/public/restaurants/${a.slug}/orders`, payload: delivery(productId) });
    const res = await app.inject({ url: `/restaurants/${b.slug}/customers?phone=11988881111`, headers: auth(b.token) });
    assert.equal(res.statusCode, 404);
  });

  it('exige login e telefone com DDD', async () => {
    const owner = await signup(app);
    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/customers?phone=11988881111` })).statusCode, 401);
    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/customers?phone=98888`, headers: auth(owner.token) })).statusCode, 400);
  });

  it('funcionário também pode buscar', async () => {
    const owner = await signup(app);
    const staff = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });
    const productId = await createSimpleProduct(app, owner);
    await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: delivery(productId) });
    const res = await app.inject({ url: `/restaurants/${owner.slug}/customers?phone=11988881111`, headers: auth(staff.token) });
    assert.equal(res.statusCode, 200);
  });
});
