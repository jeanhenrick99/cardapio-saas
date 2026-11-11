/**
 * Conta dividida, transferência entre mesas/comandas e corridas entre lançar, fechar e transferir.
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Order } from '@cardapio/shared';
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

const post = (owner: Owner, path: string, payload: object) =>
  app.inject({ method: 'POST', url: `/restaurants/${owner.slug}${path}`, headers: auth(owner.token), payload });

const launch = (owner: Owner, productId: string, type: 'mesa' | 'comanda', number: string, quantity = 1) =>
  post(owner, '/orders', { type, table: number, items: [{ productId, quantity }] });

const current = async (owner: Owner, kind: 'MESA' | 'COMANDA', number: string) =>
  app.inject({ url: `/restaurants/${owner.slug}/tabs/current?kind=${kind}&number=${number}`, headers: auth(owner.token) });

const tabOf = async (owner: Owner, kind: 'MESA' | 'COMANDA', number: string) => (await current(owner, kind, number)).json();

describe('conta dividida', () => {
  it('fecha com Pix + dinheiro; o caixa conta só a parte em dinheiro na gaveta', async () => {
    const { owner, productId } = await setup(5000);
    await post(owner, '/cash/open', { openingCents: 0 });
    await launch(owner, productId, 'mesa', '4', 2); // 100,00
    const tab = await tabOf(owner, 'MESA', '4');

    const res = await post(owner, `/tabs/${tab.id}/close`, {
      applyServiceFee: true, // 110,00
      payments: [
        { method: 'Pix', amountCents: 5_500 },
        { method: 'Dinheiro', amountCents: 3_000 },
        { method: 'Dinheiro', amountCents: 2_500 },
      ],
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().totalCents, 11_000);

    const stored = await prisma.tab.findUniqueOrThrow({ where: { id: tab.id }, include: { payments: true } });
    assert.equal(stored.paymentMethod, 'Pix + Dinheiro');
    assert.equal(stored.payments.length, 3);

    const cash = (await app.inject({ url: `/restaurants/${owner.slug}/cash`, headers: auth(owner.token) })).json();
    assert.equal(cash.current.summary.cashSalesCents, 5_500);
    assert.equal(cash.current.summary.salesCents, 11_000);
  });

  it('pagamentos que não fecham o total são recusados com o valor que falta', async () => {
    const { owner, productId } = await setup(3000);
    await launch(owner, productId, 'mesa', '5');
    const tab = await tabOf(owner, 'MESA', '5');
    const res = await post(owner, `/tabs/${tab.id}/close`, { applyServiceFee: false, payments: [{ method: 'Pix', amountCents: 1_000 }] });
    assert.equal(res.statusCode, 422);
    assert.match(res.json().error, /Faltam R\$\s20,00/);
    assert.equal(res.json().remainingCents, 2_000);
    // a conta continua aberta
    assert.equal((await current(owner, 'MESA', '5')).statusCode, 200);
  });

  it('conta com tudo cancelado fecha sem pagamento', async () => {
    const { owner, productId } = await setup();
    const orderId = (await launch(owner, productId, 'comanda', '77')).json().order.id;
    await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/orders/${orderId}/status`,
      headers: auth(owner.token),
      payload: { status: 'CANCELED' },
    });
    const tab = await tabOf(owner, 'COMANDA', '77');
    const res = await post(owner, `/tabs/${tab.id}/close`, { payments: [] });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().totalCents, 0);
  });
});

describe('transferência', () => {
  it('conta inteira para mesa livre: troca de número, mantém a abertura e atualiza os pedidos', async () => {
    const { owner, productId } = await setup();
    await launch(owner, productId, 'mesa', '1');
    await launch(owner, productId, 'mesa', '1');
    const tab = await tabOf(owner, 'MESA', '1');

    const res = await post(owner, `/tabs/${tab.id}/transfer`, { kind: 'MESA', number: '08' });
    assert.equal(res.statusCode, 200, res.body);
    const { targetId: _t, ...rest } = res.json<{ targetId: string }>();
    assert.deepEqual(rest, { kind: 'MESA', number: '8', moved: 2, merged: false });

    assert.equal((await current(owner, 'MESA', '1')).statusCode, 404);
    const moved = await tabOf(owner, 'MESA', '8');
    assert.equal(moved.id, tab.id);
    assert.equal(moved.openedAt, tab.openedAt);
    const orders = await prisma.order.findMany({ where: { tabId: tab.id } });
    assert.ok(orders.every((o) => (o.data as unknown as Order).table === '8'));
  });

  it('mesa para comanda ocupada: as contas se juntam e a origem some', async () => {
    const { owner, productId } = await setup(1000);
    await launch(owner, productId, 'mesa', '2', 3); // 30,00
    await launch(owner, productId, 'comanda', '150', 1); // 10,00
    const mesa = await tabOf(owner, 'MESA', '2');

    const res = await post(owner, `/tabs/${mesa.id}/transfer`, { kind: 'COMANDA', number: '150' });
    assert.equal(res.json().merged, true);
    assert.equal(await prisma.tab.count({ where: { id: mesa.id } }), 0);
    const comanda = await tabOf(owner, 'COMANDA', '150');
    assert.equal(comanda.consumedCents, 4_000);
    assert.equal(comanda.ordersCount, 2);
    const moved = await prisma.order.findFirstOrThrow({ where: { tabId: comanda.id, type: 'comanda', totalCents: 3_000 } });
    assert.equal((moved.data as unknown as Order).type, 'comanda');
  });

  it('só alguns lançamentos: eles abrem a mesa de destino e o resto fica', async () => {
    const { owner, productId } = await setup(1000);
    const first = (await launch(owner, productId, 'mesa', '6', 1)).json().order.id;
    await launch(owner, productId, 'mesa', '6', 2);
    const tab = await tabOf(owner, 'MESA', '6');

    const res = await post(owner, `/tabs/${tab.id}/transfer`, { kind: 'MESA', number: '7', orderIds: [first] });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await tabOf(owner, 'MESA', '6')).consumedCents, 2_000);
    const mesa7 = await tabOf(owner, 'MESA', '7');
    assert.equal(mesa7.consumedCents, 1_000);
    assert.equal(mesa7.openedBy, owner.name);
  });

  it('recusa: mesma conta, conta fechada e pedido de outra conta', async () => {
    const { owner, productId } = await setup();
    await launch(owner, productId, 'mesa', '9');
    const other = (await launch(owner, productId, 'mesa', '10')).json().order.id;
    const tab = await tabOf(owner, 'MESA', '9');

    assert.equal((await post(owner, `/tabs/${tab.id}/transfer`, { kind: 'MESA', number: '09' })).statusCode, 400);
    assert.equal((await post(owner, `/tabs/${tab.id}/transfer`, { kind: 'MESA', number: '11', orderIds: [other] })).statusCode, 400);
    await post(owner, `/tabs/${tab.id}/close`, { paymentMethod: 'Pix' });
    assert.equal((await post(owner, `/tabs/${tab.id}/transfer`, { kind: 'MESA', number: '11' })).statusCode, 409);
  });
});

describe('corridas', () => {
  it('lançar enquanto a conta fecha: o pedido nunca cai numa conta já fechada', async () => {
    const { owner, productId } = await setup(1000);
    for (let round = 0; round < 5; round++) {
      const mesa = String(20 + round);
      await launch(owner, productId, 'mesa', mesa);
      const tab = await tabOf(owner, 'MESA', mesa);
      const [closed, launched] = await Promise.all([
        post(owner, `/tabs/${tab.id}/close`, { paymentMethod: 'Pix', applyServiceFee: false }),
        launch(owner, productId, 'mesa', mesa),
      ]);
      assert.equal(closed.statusCode, 200, closed.body);
      assert.equal(launched.statusCode, 201, launched.body);

      // o total cobrado é exatamente a soma dos pedidos que ficaram na conta fechada
      const stored = await prisma.tab.findUniqueOrThrow({ where: { id: tab.id }, include: { orders: true } });
      assert.equal(stored.totalCents, stored.orders.reduce((s, o) => s + o.totalCents, 0));
      // e o pedido novo, se não entrou antes do fechamento, abriu outra conta
      const order = await prisma.order.findUniqueOrThrow({ where: { id: launched.json().order.id }, include: { tab: true } });
      assert.ok(order.tabId === tab.id || order.tab?.status === 'OPEN');
    }
  });

  it('transferências cruzadas ao mesmo tempo não travam e não perdem pedidos', async () => {
    const { owner, productId } = await setup();
    await launch(owner, productId, 'mesa', '30');
    await launch(owner, productId, 'mesa', '31');
    const a = await tabOf(owner, 'MESA', '30');
    const b = await tabOf(owner, 'MESA', '31');
    const results = await Promise.all([
      post(owner, `/tabs/${a.id}/transfer`, { kind: 'MESA', number: '31' }),
      post(owner, `/tabs/${b.id}/transfer`, { kind: 'MESA', number: '30' }),
    ]);
    for (const r of results) assert.ok([200, 409].includes(r.statusCode), r.body);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    const open = await prisma.tab.findMany({ where: { restaurantId: restaurant.id, status: 'OPEN' }, include: { orders: true } });
    assert.equal(open.flatMap((t) => t.orders).length, 2);
  });
});
