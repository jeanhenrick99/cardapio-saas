/**
 * Testes de integração das etapas do pedido (Kanban de delivery/retirada).
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
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

async function setup() {
  const owner = await signup(app);
  const productId = await createSimpleProduct(app, owner, 4000);
  const place = async (type: 'delivery' | 'retirada' | 'mesa') => {
    const payload =
      type === 'mesa'
        ? tableOrder(productId)
        : {
            type,
            customer: { name: 'Ana', phone: '11 99999-0000', address: 'Rua A, 1' },
            items: [{ productId, quantity: 1 }],
          };
    const res = await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload });
    assert.equal(res.statusCode, 201, res.body);
    const order = await prisma.order.findFirstOrThrow({
      where: { restaurant: { slug: owner.slug }, number: res.json<{ number: number }>().number },
    });
    return order.id;
  };
  return { owner, place };
}

const setStatus = (owner: Owner, id: string, status: string, token = owner.token) =>
  app.inject({ method: 'PATCH', url: `/restaurants/${owner.slug}/orders/${id}/status`, headers: auth(token), payload: { status } });

const board = async (owner: Owner) =>
  (await app.inject({ url: `/restaurants/${owner.slug}/orders?view=board`, headers: auth(owner.token) })).json<
    { id: string; type: string; status: string }[]
  >();

describe('etapas do pedido', () => {
  it('pedido novo começa como "Recebido" e o quadro mostra só delivery e retirada', async () => {
    const { owner, place } = await setup();
    const delivery = await place('delivery');
    const pickup = await place('retirada');
    await place('mesa');
    const cards = await board(owner);
    assert.deepEqual(cards.map((c) => [c.id, c.status]), [
      [delivery, 'RECEIVED'],
      [pickup, 'RECEIVED'],
    ]);
  });

  it('delivery percorre o fluxo completo até "Entregue" e continua no quadro', async () => {
    const { owner, place } = await setup();
    const id = await place('delivery');
    for (const status of ['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']) {
      const res = await setStatus(owner, id, status);
      assert.equal(res.statusCode, 200, `${status}: ${res.body}`);
    }
    assert.equal((await board(owner))[0]?.status, 'COMPLETED');
  });

  it('não pula etapas e retirada não "sai para entrega"', async () => {
    const { owner, place } = await setup();
    const delivery = await place('delivery');
    const skip = await setStatus(owner, delivery, 'READY');
    assert.equal(skip.statusCode, 409);
    assert.match(skip.json().error, /Recebido.*Pronto/);

    const pickup = await place('retirada');
    await setStatus(owner, pickup, 'PREPARING');
    await setStatus(owner, pickup, 'READY');
    assert.equal((await setStatus(owner, pickup, 'OUT_FOR_DELIVERY')).statusCode, 409);
    assert.equal((await setStatus(owner, pickup, 'COMPLETED')).statusCode, 200);
  });

  it('pode voltar uma etapa para corrigir um engano', async () => {
    const { owner, place } = await setup();
    const id = await place('delivery');
    await setStatus(owner, id, 'PREPARING');
    assert.equal((await setStatus(owner, id, 'RECEIVED')).statusCode, 200);
  });

  it('cancelado sai do quadro e não pode mais mudar', async () => {
    const { owner, place } = await setup();
    const id = await place('delivery');
    assert.equal((await setStatus(owner, id, 'CANCELED')).statusCode, 200);
    assert.deepEqual(await board(owner), []);
    assert.equal((await setStatus(owner, id, 'PREPARING')).statusCode, 409);
  });

  it('dois funcionários clicando "Iniciar preparo" ao mesmo tempo: só um vence', async () => {
    const { owner, place } = await setup();
    const id = await place('delivery');
    const results = await Promise.all(Array.from({ length: 5 }, () => setStatus(owner, id, 'PREPARING')));
    const codes = results.map((r) => r.statusCode).sort();
    assert.deepEqual(codes, [200, 409, 409, 409, 409]);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id } })).status, 'PREPARING');
  });

  it('funcionário pode mover; outro restaurante não enxerga o pedido', async () => {
    const { owner, place } = await setup();
    const staff = await signup(app);
    const outsider = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });
    const id = await place('delivery');

    assert.equal((await setStatus(owner, id, 'PREPARING', staff.token)).statusCode, 200);
    assert.equal((await setStatus(owner, id, 'READY', outsider.token)).statusCode, 404);
  });

  it('a lista de pedidos do painel traz a etapa', async () => {
    const { owner, place } = await setup();
    await place('mesa');
    const list = (await app.inject({ url: `/restaurants/${owner.slug}/orders`, headers: auth(owner.token) })).json<{ status: string }[]>();
    assert.equal(list[0]?.status, 'RECEIVED');
  });
});
