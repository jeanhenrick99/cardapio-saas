/**
 * Testes de integração do painel ao vivo: API real ouvindo numa porta + clientes WebSocket reais.
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { PROTOCOL_VERSION, type PanelEvent, type ServerMessage } from '@cardapio/shared';
import { buildApp } from '../app';
import { auth, createSimpleProduct, signup, tableOrder } from '../test/helpers';

let app: FastifyInstance;
let wsBase: string;

before(async () => {
  app = await buildApp({ logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  wsBase = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
after(async () => {
  await app.close();
});

/** Cliente WebSocket de teste: guarda as mensagens e permite esperar por uma específica. */
function connect<T>(url: string) {
  const ws = new WebSocket(url);
  const messages: T[] = [];
  const waiters: { match: (m: T) => boolean; resolve: (m: T) => void }[] = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as T;
    messages.push(msg);
    for (const w of [...waiters]) {
      if (w.match(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  return {
    ws,
    messages,
    closed,
    waitFor(match: (m: T) => boolean, timeoutMs = 3000): Promise<T> {
      const found = messages.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('mensagem esperada não chegou')), timeoutMs);
        waiters.push({ match, resolve: (m) => (clearTimeout(timer), resolve(m)) });
      });
    },
  };
}

async function liveToken(slug: string, token: string) {
  const res = await app.inject({ method: 'POST', url: `/restaurants/${slug}/live-token`, headers: auth(token) });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<{ token: string }>().token;
}

async function openPanel(owner: { slug: string; token: string }) {
  const client = connect<PanelEvent>(`${wsBase}/panel/live?token=${await liveToken(owner.slug, owner.token)}`);
  await client.waitFor((m) => m.type === 'ready');
  return client;
}

describe('painel ao vivo: autenticação', () => {
  it('o passe exige login e ser membro do restaurante', async () => {
    const a = await signup(app);
    const b = await signup(app);
    assert.equal((await app.inject({ method: 'POST', url: `/restaurants/${a.slug}/live-token` })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: `/restaurants/${a.slug}/live-token`, headers: auth(b.token) })).statusCode, 404);
  });

  it('recusa conexão sem passe ou com passe inválido', async () => {
    assert.equal(await connect(`${wsBase}/panel/live`).closed, 4001);
    assert.equal(await connect(`${wsBase}/panel/live?token=inventado`).closed, 4001);
  });

  it('o passe só pode ser usado uma vez', async () => {
    const owner = await signup(app);
    const token = await liveToken(owner.slug, owner.token);
    const first = connect<PanelEvent>(`${wsBase}/panel/live?token=${token}`);
    await first.waitFor((m) => m.type === 'ready');
    assert.equal(await connect(`${wsBase}/panel/live?token=${token}`).closed, 4001);
    first.ws.close();
  });
});

describe('painel ao vivo: eventos', () => {
  it('avisa na hora quando chega um pedido, só para o restaurante certo', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const productId = await createSimpleProduct(app, a);
    const panelA = await openPanel(a);
    const panelB = await openPanel(b);

    await app.inject({ method: 'POST', url: `/public/restaurants/${a.slug}/orders`, payload: tableOrder(productId) });
    const event = await panelA.waitFor((m) => m.type === 'order_created');
    assert.deepEqual({ type: event.type, number: (event as { number: number }).number }, { type: 'order_created', number: 1 });

    // O restaurante B não recebe nada do A.
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(panelB.messages.map((m) => m.type), ['ready']);
    panelA.ws.close();
    panelB.ws.close();
  });

  it('avisa quando a loja é aberta/fechada', async () => {
    const owner = await signup(app);
    const panel = await openPanel(owner);
    await app.inject({ method: 'PATCH', url: `/restaurants/${owner.slug}/settings`, headers: auth(owner.token), payload: { acceptingOrders: false } });
    await panel.waitFor((m) => m.type === 'store_updated');
    panel.ws.close();
  });

  it('avisa quando o agente conecta e quando a impressão é confirmada', async () => {
    const owner = await signup(app);
    const productId = await createSimpleProduct(app, owner);
    const panel = await openPanel(owner);

    // Pareia e conecta um agente de impressão de verdade.
    const { code } = (await app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/pairing-codes`, headers: auth(owner.token) })).json<{ code: string }>();
    const { token: agentToken } = (await app.inject({ method: 'POST', url: '/agents/pair', payload: { code } })).json<{ token: string }>();
    const agent = connect<ServerMessage>(`${wsBase}/agent`);
    await new Promise((r) => agent.ws.once('open', r));
    agent.ws.send(JSON.stringify({ type: 'hello', token: agentToken, agentVersion: 'teste', protocolVersion: PROTOCOL_VERSION, printers: ['cozinha'] }));
    await agent.waitFor((m) => m.type === 'welcome');
    await panel.waitFor((m) => m.type === 'agents_changed');

    // Pedido → agente recebe o job → confirma a impressão → painel é avisado.
    await app.inject({ method: 'POST', url: `/public/restaurants/${owner.slug}/orders`, payload: tableOrder(productId) });
    const job = await agent.waitFor((m) => m.type === 'print_job');
    assert.equal(job.type, 'print_job');
    const created = await panel.waitFor((m) => m.type === 'order_created');
    agent.ws.send(
      JSON.stringify({
        type: 'ack',
        jobId: (job as { jobId: string }).jobId,
        status: 'printed',
        printers: [{ name: 'cozinha', status: 'printed' }],
      }),
    );
    const updated = await panel.waitFor((m) => m.type === 'order_updated');
    assert.deepEqual(updated, {
      type: 'order_updated',
      orderId: (created as { orderId: string }).orderId,
      printStatus: 'PRINTED',
    });

    // Agente desconecta → painel é avisado de novo.
    const before = panel.messages.filter((m) => m.type === 'agents_changed').length;
    agent.ws.close();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(panel.messages.filter((m) => m.type === 'agents_changed').length, before + 1);
    panel.ws.close();
  });
});
