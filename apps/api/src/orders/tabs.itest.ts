/**
 * Testes de integração das contas (mesas e comandas).
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

type Owner = Awaited<ReturnType<typeof signup>>;

async function setup(priceCents = 2000) {
  const owner = await signup(app);
  const productId = await createSimpleProduct(app, owner, priceCents);
  return { owner, productId };
}

const pdvOrder = (owner: Owner, productId: string, type: 'mesa' | 'comanda', number: string, quantity = 1) =>
  app.inject({
    method: 'POST',
    url: `/restaurants/${owner.slug}/orders`,
    headers: auth(owner.token),
    payload: { type, table: number, items: [{ productId, quantity }] },
  });

const list = async (owner: Owner, kind?: 'MESA' | 'COMANDA') =>
  (await app.inject({ url: `/restaurants/${owner.slug}/tabs${kind ? `?kind=${kind}` : ''}`, headers: auth(owner.token) })).json<{
    tableCount: number;
    open: { id: string; kind: string; number: string; ordersCount: number; consumedCents: number }[];
    closed: { id: string; number: string; totalCents: number; paymentMethod: string }[];
  }>();

const close = (owner: Owner, tabId: string, body: object = { paymentMethod: 'Pix' }) =>
  app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/tabs/${tabId}/close`, headers: auth(owner.token), payload: body });

describe('conta da mesa', () => {
  it('o primeiro pedido abre a conta e os seguintes somam nela ("07" e "7" são a mesma mesa)', async () => {
    const { owner, productId } = await setup(2000);
    assert.equal((await pdvOrder(owner, productId, 'mesa', '7')).statusCode, 201);
    assert.equal((await pdvOrder(owner, productId, 'mesa', '07', 2)).statusCode, 201);
    await pdvOrder(owner, productId, 'mesa', '8');

    const { open } = await list(owner, 'MESA');
    const mesa7 = open.find((t) => t.number === '7')!;
    assert.equal(open.length, 2);
    assert.equal(mesa7.ordersCount, 2);
    assert.equal(mesa7.consumedCents, 6000);
  });

  it('pedido pelo QR Code da mesa entra na mesma conta aberta pelo garçom', async () => {
    const { owner, productId } = await setup();
    await pdvOrder(owner, productId, 'mesa', '3');
    const qr = await app.inject({
      method: 'POST',
      url: `/public/restaurants/${owner.slug}/orders`,
      payload: { type: 'mesa', table: '3', items: [{ productId, quantity: 1 }] },
    });
    assert.equal(qr.statusCode, 201);
    const { open } = await list(owner);
    assert.equal(open.length, 1);
    assert.equal(open[0]!.ordersCount, 2);
  });

  it('dois lançamentos simultâneos na mesa livre abrem UMA conta só', async () => {
    const { owner, productId } = await setup();
    const results = await Promise.all(Array.from({ length: 6 }, () => pdvOrder(owner, productId, 'mesa', '12')));
    assert.ok(results.every((r) => r.statusCode === 201));
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    const tabs = await prisma.tab.findMany({ where: { restaurantId: restaurant.id, number: '12' } });
    assert.equal(tabs.length, 1);
    assert.equal(await prisma.order.count({ where: { tabId: tabs[0]!.id } }), 6);
  });

  it('pedido cancelado não entra no consumo', async () => {
    const { owner, productId } = await setup(2000);
    await pdvOrder(owner, productId, 'mesa', '5');
    const second = (await pdvOrder(owner, productId, 'mesa', '5')).json<{ order: { id: string } }>().order.id;
    await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/orders/${second}/status`,
      headers: auth(owner.token),
      payload: { status: 'CANCELED' },
    });
    const { open } = await list(owner);
    assert.equal(open[0]!.consumedCents, 2000);
    assert.equal(open[0]!.ordersCount, 1);
  });
});

describe('fechamento', () => {
  it('fecha com taxa de serviço de 10% e desconto; a mesa fica livre e o próximo pedido abre outra conta', async () => {
    const { owner, productId } = await setup(5000);
    await pdvOrder(owner, productId, 'mesa', '9', 2); // R$ 100,00
    const tabId = (await list(owner)).open[0]!.id;

    const res = await close(owner, tabId, { paymentMethod: 'Cartão de crédito', applyServiceFee: true, discountCents: 500 });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(
      { s: res.json().subtotalCents, f: res.json().serviceFeeCents, d: res.json().discountCents, t: res.json().totalCents },
      { s: 10_000, f: 1_000, d: 500, t: 10_500 },
    );

    const after = await list(owner);
    assert.equal(after.open.length, 0);
    assert.equal(after.closed[0]!.totalCents, 10_500);
    assert.equal(after.closed[0]!.paymentMethod, 'Cartão de crédito');

    await pdvOrder(owner, productId, 'mesa', '9');
    const reopened = await list(owner);
    assert.equal(reopened.open.length, 1);
    assert.notEqual(reopened.open[0]!.id, tabId);
  });

  it('sem taxa de serviço quando o cliente não aceita', async () => {
    const { owner, productId } = await setup(3000);
    await pdvOrder(owner, productId, 'mesa', '1');
    const tabId = (await list(owner)).open[0]!.id;
    const res = await close(owner, tabId, { paymentMethod: 'Pix', applyServiceFee: false });
    assert.equal(res.json().totalCents, 3000);
  });

  it('fechar duas vezes: a segunda é recusada', async () => {
    const { owner, productId } = await setup();
    await pdvOrder(owner, productId, 'mesa', '2');
    const tabId = (await list(owner)).open[0]!.id;
    const results = await Promise.all([close(owner, tabId), close(owner, tabId)]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  });
});

describe('comandas', () => {
  it('comanda é aberta pela equipe e listada separada das mesas', async () => {
    const { owner, productId } = await setup();
    await pdvOrder(owner, productId, 'comanda', '152');
    await pdvOrder(owner, productId, 'mesa', '152');
    assert.deepEqual((await list(owner, 'COMANDA')).open.map((t) => [t.kind, t.number]), [['COMANDA', '152']]);
    assert.deepEqual((await list(owner, 'MESA')).open.map((t) => [t.kind, t.number]), [['MESA', '152']]);
  });

  it('o cliente não abre comanda pelo cardápio online', async () => {
    const { owner, productId } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/public/restaurants/${owner.slug}/orders`,
      payload: { type: 'comanda', table: '152', items: [{ productId, quantity: 1 }] },
    });
    assert.equal(res.statusCode, 400);
  });

  it('detalhe da conta pelo número traz os pedidos; número livre responde 404', async () => {
    const { owner, productId } = await setup();
    await pdvOrder(owner, productId, 'comanda', 'a12');
    const res = await app.inject({ url: `/restaurants/${owner.slug}/tabs/current?kind=COMANDA&number=A12`, headers: auth(owner.token) });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().orders.length, 1);
    assert.equal(res.json().orders[0].origin, 'pdv');
    assert.equal(res.json().serviceFeePercent, 10);
    const free = await app.inject({ url: `/restaurants/${owner.slug}/tabs/current?kind=COMANDA&number=999`, headers: auth(owner.token) });
    assert.equal(free.statusCode, 404);
  });
});

describe('acesso e configuração', () => {
  it('funcionário fecha conta; outro restaurante não vê as contas', async () => {
    const { owner, productId } = await setup();
    const staff = await signup(app);
    const outsider = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });
    await pdvOrder(owner, productId, 'mesa', '4');
    const tabId = (await list(owner)).open[0]!.id;

    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/tabs`, headers: auth(outsider.token) })).statusCode, 404);
    assert.equal((await close({ ...owner, token: outsider.token }, tabId)).statusCode, 404);
    const closed = await close({ ...owner, token: staff.token }, tabId);
    assert.equal(closed.statusCode, 200);
  });

  it('dono define quantidade de mesas e taxa de serviço', async () => {
    const { owner } = await setup();
    const res = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/settings`,
      headers: auth(owner.token),
      payload: { tableCount: 15, serviceFeePercent: 12 },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await list(owner)).tableCount, 15);
  });
});
