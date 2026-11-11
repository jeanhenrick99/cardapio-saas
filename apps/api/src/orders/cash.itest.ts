/**
 * Testes de integração do caixa e do relatório de vendas.
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { localDay } from '@cardapio/shared';
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

const openCash = (owner: Owner, openingCents = 10_000) => post(owner, '/cash/open', { openingCents });
const cash = async (owner: Owner) => (await app.inject({ url: `/restaurants/${owner.slug}/cash`, headers: auth(owner.token) })).json();

const balcao = (owner: Owner, productId: string, paymentMethod: string, quantity = 1) =>
  post(owner, '/orders', { type: 'retirada', customer: { name: 'Cliente' }, paymentMethod, items: [{ productId, quantity }] });

async function closeMesa(owner: Owner, productId: string, mesa: string, paymentMethod: string) {
  await post(owner, '/orders', { type: 'mesa', table: mesa, items: [{ productId, quantity: 1 }] });
  const tabs = (await app.inject({ url: `/restaurants/${owner.slug}/tabs`, headers: auth(owner.token) })).json();
  const tab = tabs.open.find((t: { number: string }) => t.number === mesa);
  return post(owner, `/tabs/${tab.id}/close`, { paymentMethod, applyServiceFee: false });
}

describe('abertura do caixa', () => {
  it('abre com troco; um segundo caixa aberto é recusado, mesmo com cliques simultâneos', async () => {
    const { owner } = await setup();
    const results = await Promise.all([openCash(owner), openCash(owner), openCash(owner)]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [201, 409, 409]);
    const { current } = await cash(owner);
    assert.equal(current.openingCents, 10_000);
    assert.equal(current.summary.expectedCashCents, 10_000);
  });

  it('sem caixa aberto: GET devolve current null e sangria é recusada', async () => {
    const { owner } = await setup();
    assert.equal((await cash(owner)).current, null);
    const res = await post(owner, '/cash/movements', { kind: 'SANGRIA', amountCents: 100, reason: 'teste' });
    assert.equal(res.statusCode, 409);
  });
});

describe('vendas no caixa', () => {
  it('soma balcão e contas fechadas por forma de pagamento; cancelado e venda antes da abertura ficam fora', async () => {
    const { owner, productId } = await setup(2000);
    await balcao(owner, productId, 'Dinheiro'); // antes de abrir: não entra
    await openCash(owner, 5_000);

    await balcao(owner, productId, 'Dinheiro', 2); // 40,00
    await balcao(owner, productId, 'Pix'); // 20,00
    const canceled = (await balcao(owner, productId, 'Dinheiro')).json().order.id;
    await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/orders/${canceled}/status`,
      headers: auth(owner.token),
      payload: { status: 'CANCELED' },
    });
    assert.equal((await closeMesa(owner, productId, '3', 'Cartão de débito')).statusCode, 200); // 20,00

    const { summary } = (await cash(owner)).current;
    assert.deepEqual(
      summary.byPayment.map((p: { method: string; cents: number }) => [p.method, p.cents]),
      [
        ['Pix', 2_000],
        ['Cartão de débito', 2_000],
        ['Dinheiro', 4_000],
      ],
    );
    assert.equal(summary.salesCents, 8_000);
    assert.equal(summary.expectedCashCents, 5_000 + 4_000);
  });

  it('sangria e suprimento mexem só no dinheiro esperado; sangria acima do saldo é recusada', async () => {
    const { owner, productId } = await setup(3000);
    await openCash(owner, 10_000);
    await balcao(owner, productId, 'Dinheiro'); // +30,00
    assert.equal((await post(owner, '/cash/movements', { kind: 'SANGRIA', amountCents: 20_000, reason: 'depósito' })).statusCode, 422);
    assert.equal((await post(owner, '/cash/movements', { kind: 'SANGRIA', amountCents: 8_000, reason: 'depósito' })).statusCode, 201);
    assert.equal((await post(owner, '/cash/movements', { kind: 'SUPRIMENTO', amountCents: 1_000, reason: 'moedas' })).statusCode, 201);
    assert.equal((await post(owner, '/cash/movements', { kind: 'SUPRIMENTO', amountCents: 1_000, reason: '' })).statusCode, 400);

    const { current } = await cash(owner);
    assert.equal(current.movements.length, 2);
    assert.equal(current.summary.expectedCashCents, 10_000 + 3_000 - 8_000 + 1_000);
    assert.equal(current.summary.salesCents, 3_000);
  });
});

describe('fechamento do caixa', () => {
  it('grava contado, esperado e diferença; o resumo não muda se um pedido for cancelado depois', async () => {
    const { owner, productId } = await setup(2500);
    await openCash(owner, 10_000);
    const order = (await balcao(owner, productId, 'Dinheiro')).json().order.id;

    const res = await post(owner, '/cash/close', { countedCents: 12_000, notes: 'faltou troco' });
    assert.equal(res.statusCode, 200, res.body);
    const closed = res.json();
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.expectedCashCents, 12_500);
    assert.equal(closed.differenceCents, -500);
    assert.equal(closed.summary.differenceCents, -500);

    await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/orders/${order}/status`,
      headers: auth(owner.token),
      payload: { status: 'CANCELED' },
    });
    const again = (await app.inject({ url: `/restaurants/${owner.slug}/cash/${closed.id}`, headers: auth(owner.token) })).json();
    assert.equal(again.summary.salesCents, 2_500);

    const list = await cash(owner);
    assert.equal(list.current, null);
    assert.equal(list.recent[0].id, closed.id);
  });

  it('fechar duas vezes ao mesmo tempo: um fecha, o outro recebe 409; depois disso as vendas não entram em caixa', async () => {
    const { owner, productId } = await setup();
    await openCash(owner);
    const results = await Promise.all([post(owner, '/cash/close', { countedCents: 10_000 }), post(owner, '/cash/close', { countedCents: 10_000 })]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);

    const id = (await balcao(owner, productId, 'Pix')).json().order.id;
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id } })).cashRegisterId, null);
    // e um novo caixa pode ser aberto
    assert.equal((await openCash(owner)).statusCode, 201);
  });

  it('funcionário opera o caixa; outro restaurante não vê', async () => {
    const { owner } = await setup();
    const staff = await signup(app);
    const outsider = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });

    assert.equal((await openCash({ ...owner, token: staff.token })).statusCode, 201);
    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/cash`, headers: auth(outsider.token) })).statusCode, 404);
    assert.equal((await post({ ...owner, token: outsider.token }, '/cash/close', { countedCents: 0 })).statusCode, 404);
    const closed = await post({ ...owner, token: staff.token }, '/cash/close', { countedCents: 10_000 });
    assert.equal(closed.json().closedBy, staff.name);
  });
});

describe('relatório de vendas', () => {
  const report = (owner: Owner, query: string) => app.inject({ url: `/restaurants/${owner.slug}/reports/sales?${query}`, headers: auth(owner.token) });

  it('soma pedidos avulsos e contas fechadas do dia, com produtos e caixas', async () => {
    const { owner, productId } = await setup(2000);
    await openCash(owner, 0);
    await balcao(owner, productId, 'Dinheiro', 2); // 40,00
    await closeMesa(owner, productId, '1', 'Pix'); // 20,00
    await post(owner, '/cash/close', { countedCents: 4_000 });

    const today = localDay(new Date());
    const res = await report(owner, `from=${today}&to=${today}`);
    assert.equal(res.statusCode, 200, res.body);
    const r = res.json();
    assert.equal(r.revenueCents, 6_000);
    assert.equal(r.receiptsCount, 2);
    assert.equal(r.averageTicketCents, 3_000);
    assert.deepEqual(r.byDay, [{ day: today, cents: 6_000, count: 2 }]);
    assert.deepEqual(r.topProducts[0], { name: 'Lanche', quantity: 3, cents: 6_000 });
    assert.equal(r.registers.length, 1);
    assert.equal(r.registers[0].differenceCents, 0);
  });

  it('só o dono vê; período inválido é recusado', async () => {
    const { owner } = await setup();
    const staff = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });

    assert.equal((await report({ ...owner, token: staff.token }, 'from=2026-11-01&to=2026-11-02')).statusCode, 403);
    assert.equal((await report(owner, 'from=2026-11-10&to=2026-11-01')).statusCode, 400);
    assert.equal((await report(owner, 'from=2026-02-30&to=2026-03-01')).statusCode, 400);
    assert.equal((await report(owner, 'from=2020-01-01&to=2026-01-01')).statusCode, 400);
  });
});
