/**
 * Testes de integração do administrador da plataforma (suporte).
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma } from '../db';
import { syncPlatformAdmins } from '../scripts/platform-admin';
import { auth, createSimpleProduct, signup } from '../test/helpers';

let app: FastifyInstance;
before(async () => {
  app = await buildApp({ logger: false });
});
after(async () => {
  await app.close();
});

/** Um usuário comum promovido a administrador (como o seed faz a partir do .env). */
async function adminUser() {
  const user = await signup(app);
  await prisma.user.update({ where: { id: user.userId }, data: { isPlatformAdmin: true } });
  return user;
}
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe('área do administrador', () => {
  it('quem não é administrador recebe 404, logado ou não', async () => {
    const owner = await signup(app);
    assert.equal((await app.inject({ url: '/admin/restaurants' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/admin/restaurants', headers: auth(owner.token) })).statusCode, 404);
    const create = await app.inject({
      method: 'POST',
      url: '/admin/restaurants',
      headers: auth(owner.token),
      payload: { name: 'X', slug: `x-${unique()}`, ownerName: 'Fulano', ownerEmail: 'fulano@teste.dev' },
    });
    assert.equal(create.statusCode, 404);
    assert.equal((await app.inject({ url: '/auth/me', headers: auth(owner.token) })).json().isPlatformAdmin, false);
  });

  it('lista os restaurantes com dono, e busca por nome, endereço ou e-mail do dono', async () => {
    const admin = await adminUser();
    const client = await signup(app);
    const byEmail = (await app.inject({ url: `/admin/restaurants?q=${encodeURIComponent(client.email)}`, headers: auth(admin.token) })).json();
    assert.equal(byEmail.length, 1);
    assert.equal(byEmail[0].slug, client.slug);
    assert.deepEqual(byEmail[0].owners, [{ name: client.name, email: client.email }]);
    const bySlug = (await app.inject({ url: `/admin/restaurants?q=${client.slug}`, headers: auth(admin.token) })).json();
    assert.equal(bySlug[0].slug, client.slug);
  });

  it('cadastra o restaurante do cliente e o link faz dele o dono', async () => {
    const admin = await adminUser();
    const slug = `pizzaria-${unique()}`;
    const ownerEmail = `cliente-${unique()}@teste.dev`;
    const res = await app.inject({
      method: 'POST',
      url: '/admin/restaurants',
      headers: auth(admin.token),
      payload: { name: 'Pizzaria do Cliente', slug, ownerName: 'Cliente Novo', ownerEmail },
    });
    assert.equal(res.statusCode, 201, res.body);
    const { token } = res.json();

    const listed = (await app.inject({ url: `/admin/restaurants?q=${slug}`, headers: auth(admin.token) })).json();
    assert.deepEqual({ owners: listed[0].owners, pending: listed[0].pendingOwnerInvites }, { owners: [], pending: [ownerEmail] });

    const accepted = await app.inject({ method: 'POST', url: `/invites/${token}/accept`, payload: { password: 'senha-do-cliente' } });
    assert.equal(accepted.statusCode, 201, accepted.body);
    assert.deepEqual(accepted.json().user.restaurants.map((r: { slug: string; role: string }) => [r.slug, r.role]), [[slug, 'OWNER']]);
    // o cliente cadastra a própria equipe
    const invite = await app.inject({
      method: 'POST',
      url: `/restaurants/${slug}/invites`,
      headers: auth(accepted.json().token),
      payload: { name: 'Garçom', email: `garcom-${unique()}@teste.dev` },
    });
    assert.equal(invite.statusCode, 201);

    const dup = await app.inject({
      method: 'POST',
      url: '/admin/restaurants',
      headers: auth(admin.token),
      payload: { name: 'Outra', slug, ownerName: 'Outro', ownerEmail: `o-${unique()}@teste.dev` },
    });
    assert.equal(dup.statusCode, 409);
  });

  it('gera novo link de dono para um restaurante existente', async () => {
    const admin = await adminUser();
    const client = await signup(app);
    const post = (email: string) =>
      app.inject({ method: 'POST', url: `/admin/restaurants/${client.slug}/owner-invite`, headers: auth(admin.token), payload: { name: 'Novo Dono', email } });
    assert.equal((await post(client.email)).statusCode, 409);
    const res = await post(`novo-${unique()}@teste.dev`);
    assert.equal(res.statusCode, 201, res.body);
    assert.match(res.json().token, /^inv_/);
  });
});

describe('modo suporte', () => {
  it('administrador lê e altera a base de um cliente sem ser membro; a entrada fica registrada', async () => {
    const admin = await adminUser();
    const client = await signup(app);
    const productId = await createSimpleProduct(app, client);

    const enter = await app.inject({ method: 'POST', url: `/admin/restaurants/${client.slug}/enter`, headers: auth(admin.token) });
    assert.equal(enter.statusCode, 200, enter.body);

    // rota só de dono (configurações), rota de equipe (lançar pedido) e a equipe do cliente
    const patch = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${client.slug}/settings`,
      headers: auth(admin.token),
      payload: { tableCount: 12 },
    });
    assert.equal(patch.statusCode, 200, patch.body);
    const order = await app.inject({
      method: 'POST',
      url: `/restaurants/${client.slug}/orders`,
      headers: auth(admin.token),
      payload: { type: 'mesa', table: '1', items: [{ productId, quantity: 1 }] },
    });
    assert.equal(order.statusCode, 201, order.body);
    const team = (await app.inject({ url: `/restaurants/${client.slug}/team`, headers: auth(admin.token) })).json();
    assert.deepEqual(team.members.map((m: { email: string }) => m.email), [client.email]);

    const listed = (await app.inject({ url: `/admin/restaurants?q=${client.slug}`, headers: auth(admin.token) })).json();
    assert.equal(listed[0].lastSupportAccess.by, admin.name);
    // o administrador não vira membro do restaurante do cliente
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: client.slug } });
    assert.equal(await prisma.membership.count({ where: { restaurantId: restaurant.id } }), 1);
  });

  it('usuário comum continua sem ver o restaurante dos outros', async () => {
    const client = await signup(app);
    const outsider = await signup(app);
    assert.equal((await app.inject({ url: `/restaurants/${client.slug}/settings`, headers: auth(outsider.token) })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/admin/restaurants/${client.slug}/enter`, headers: auth(outsider.token) })).statusCode, 404);
  });
});

describe('administradores definidos pelo ambiente', () => {
  it('cria a conta com a senha inicial, não sobrescreve senha existente e rebaixa quem saiu da lista', async () => {
    const email = `admin-${unique()}@teste.dev`;
    const others = (await prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { email: true } })).map((u) => u.email);
    const list = (...emails: string[]) => [...others, ...emails].join(', ');
    const silent = () => undefined;

    // senha curta: não cria
    await syncPlatformAdmins(prisma, { emails: list(email), password: 'curta' }, silent);
    assert.equal(await prisma.user.count({ where: { email } }), 0);

    await syncPlatformAdmins(prisma, { emails: list(email.toUpperCase()), password: 'senha-inicial-forte' }, silent);
    const login = (password: string) => app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
    const first = await login('senha-inicial-forte');
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().user.isPlatformAdmin, true);

    // rodar de novo com outra senha não troca a senha de quem já existe
    await syncPlatformAdmins(prisma, { emails: list(email), password: 'outra-senha-diferente' }, silent);
    assert.equal((await login('outra-senha-diferente')).statusCode, 401);

    // saiu da lista: deixa de ser administrador
    await syncPlatformAdmins(prisma, { emails: list() }, silent);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).isPlatformAdmin, false);
    assert.equal((await app.inject({ url: '/admin/restaurants', headers: auth(first.json().token) })).statusCode, 404);
  });
});
