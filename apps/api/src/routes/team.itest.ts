/**
 * Testes de integração da equipe: convites, papéis, remoção e redefinição de senha.
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma } from '../db';
import { auth, signup } from '../test/helpers';

let app: FastifyInstance;
before(async () => {
  app = await buildApp({ logger: false });
});
after(async () => {
  await app.close();
});

type Owner = Awaited<ReturnType<typeof signup>>;
const uniqueEmail = () => `func-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@teste.dev`;

const invite = (owner: Owner, body: object) =>
  app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/invites`, headers: auth(owner.token), payload: body });
const accept = (token: string, body: object) => app.inject({ method: 'POST', url: `/invites/${token}/accept`, payload: body });
const team = async (owner: Owner) => (await app.inject({ url: `/restaurants/${owner.slug}/team`, headers: auth(owner.token) })).json();
const login = (email: string, password: string) => app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });

async function addStaff(owner: Owner, email = uniqueEmail()) {
  const { token } = (await invite(owner, { name: 'Garçom Novo', email })).json();
  const res = await accept(token, { password: 'senha-do-garcom' });
  assert.equal(res.statusCode, 201, res.body);
  return { email, userId: res.json().user.id as string, token: res.json().token as string };
}

describe('convite', () => {
  it('pessoa nova abre o link, cria a senha, entra logada e vira funcionário', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    const created = await invite(owner, { name: 'Ana Garçonete', email: email.toUpperCase() });
    assert.equal(created.statusCode, 201, created.body);
    const { token } = created.json();
    assert.match(token, /^inv_/);
    assert.equal(await prisma.invite.count({ where: { tokenHash: token } }), 0, 'o token não fica salvo em texto puro');

    const info = (await app.inject({ url: `/invites/${token}` })).json();
    assert.deepEqual(
      { r: info.restaurant, e: info.email, role: info.role, existing: info.existingUser },
      { r: owner.restaurant.name, e: email, role: 'STAFF', existing: false },
    );

    const res = await accept(token, { name: 'Ana', password: 'senha-da-ana' });
    assert.equal(res.statusCode, 201, res.body);
    assert.deepEqual(res.json().user.restaurants.map((r: { slug: string; role: string }) => [r.slug, r.role]), [[owner.slug, 'STAFF']]);
    assert.equal((await login(email, 'senha-da-ana')).statusCode, 200);
    // e o link não vale de novo
    assert.equal((await app.inject({ url: `/invites/${token}` })).statusCode, 404);
    assert.equal((await accept(token, { password: 'senha-da-ana' })).statusCode, 404);
  });

  it('quem já tem conta confirma com a própria senha e ganha o restaurante novo', async () => {
    const owner = await signup(app);
    const other = await signup(app);
    const { token } = (await invite(owner, { name: other.name, email: other.email, role: 'OWNER' })).json();
    assert.equal((await app.inject({ url: `/invites/${token}` })).json().existingUser, true);

    assert.equal((await accept(token, { password: 'chute-errado' })).statusCode, 401);
    const res = await accept(token, { password: other.password });
    assert.equal(res.statusCode, 201, res.body);
    const slugs = res.json().user.restaurants.map((r: { slug: string }) => r.slug).sort();
    assert.deepEqual(slugs, [owner.slug, other.slug].sort());
  });

  it('senha curta é recusada e o convite continua valendo', async () => {
    const owner = await signup(app);
    const { token } = (await invite(owner, { name: 'Bia', email: uniqueEmail() })).json();
    assert.equal((await accept(token, { password: '123' })).statusCode, 400);
    assert.equal((await app.inject({ url: `/invites/${token}` })).statusCode, 200);
  });

  it('dois cliques em aceitar: só um cria a conta', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    const { token } = (await invite(owner, { name: 'Caio', email })).json();
    const results = await Promise.all([accept(token, { password: 'senha-do-caio' }), accept(token, { password: 'senha-do-caio' })]);
    assert.ok(results.some((r) => r.statusCode === 201));
    assert.ok(results.every((r) => [201, 404, 409].includes(r.statusCode)), results.map((r) => r.body).join());
    assert.equal(await prisma.user.count({ where: { email } }), 1);
  });

  it('convite novo para o mesmo e-mail invalida o anterior; revogado e vencido não abrem', async () => {
    const owner = await signup(app);
    const email = uniqueEmail();
    const first = (await invite(owner, { name: 'Davi', email })).json();
    const second = (await invite(owner, { name: 'Davi', email })).json();
    assert.equal((await app.inject({ url: `/invites/${first.token}` })).statusCode, 404);
    assert.equal((await team(owner)).invites.length, 1);

    const del = await app.inject({ method: 'DELETE', url: `/restaurants/${owner.slug}/invites/${second.id}`, headers: auth(owner.token) });
    assert.equal(del.statusCode, 204);
    assert.equal((await app.inject({ url: `/invites/${second.token}` })).statusCode, 404);

    const third = (await invite(owner, { name: 'Davi', email })).json();
    await prisma.invite.update({ where: { id: third.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await accept(third.token, { password: 'senha-do-davi' })).statusCode, 404);
  });

  it('não convida quem já está na equipe; funcionário não convida', async () => {
    const owner = await signup(app);
    assert.equal((await invite(owner, { name: 'Eu', email: owner.email })).statusCode, 409);
    const staff = await addStaff(owner);
    const res = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/invites`,
      headers: auth(staff.token),
      payload: { name: 'X', email: uniqueEmail() },
    });
    assert.equal(res.statusCode, 403);
  });
});

describe('papéis e acesso', () => {
  it('promove a dono e rebaixa; o último dono não pode deixar de ser dono', async () => {
    const owner = await signup(app);
    const staff = await addStaff(owner);
    const patch = (userId: string, role: string) =>
      app.inject({ method: 'PATCH', url: `/restaurants/${owner.slug}/members/${userId}`, headers: auth(owner.token), payload: { role } });

    assert.equal((await patch(owner.userId, 'STAFF')).statusCode, 409);
    assert.equal((await patch(staff.userId, 'OWNER')).statusCode, 200);
    assert.equal((await patch(owner.userId, 'STAFF')).statusCode, 200);
    // agora o ex-dono não acessa a área do dono
    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/team`, headers: auth(owner.token) })).statusCode, 403);
  });

  it('dois donos rebaixando um ao outro ao mesmo tempo: sempre sobra um dono', async () => {
    const owner = await signup(app);
    const second = await addStaff(owner);
    await prisma.membership.updateMany({ where: { userId: second.userId }, data: { role: 'OWNER' } });
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });

    const results = await Promise.all([
      app.inject({ method: 'PATCH', url: `/restaurants/${owner.slug}/members/${second.userId}`, headers: auth(owner.token), payload: { role: 'STAFF' } }),
      app.inject({ method: 'PATCH', url: `/restaurants/${owner.slug}/members/${owner.userId}`, headers: auth(second.token), payload: { role: 'STAFF' } }),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(await prisma.membership.count({ where: { restaurantId: restaurant.id, role: 'OWNER' } }), 1);
  });

  it('remover acesso: o funcionário perde o restaurante e, sem nenhum outro, é deslogado', async () => {
    const owner = await signup(app);
    const staff = await addStaff(owner);
    const del = (userId: string) => app.inject({ method: 'DELETE', url: `/restaurants/${owner.slug}/members/${userId}`, headers: auth(owner.token) });

    assert.equal((await del(owner.userId)).statusCode, 409);
    assert.equal((await del(staff.userId)).statusCode, 204);
    assert.equal((await app.inject({ url: '/auth/me', headers: auth(staff.token) })).statusCode, 401);
    assert.equal((await team(owner)).members.length, 1);
  });
});

describe('redefinição de senha', () => {
  it('dono gera o link, funcionário troca a senha, sessões antigas caem e a senha antiga para de valer', async () => {
    const owner = await signup(app);
    const staff = await addStaff(owner);
    const members = (await team(owner)).members;
    assert.equal(members.find((m: { userId: string }) => m.userId === staff.userId).canResetPassword, true);

    const link = await app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/members/${staff.userId}/password-reset`, headers: auth(owner.token) });
    assert.equal(link.statusCode, 201, link.body);
    const { token } = link.json();
    assert.equal((await app.inject({ url: `/password-resets/${token}` })).json().email, staff.email);

    const res = await app.inject({ method: 'POST', url: `/password-resets/${token}`, payload: { password: 'nova-senha-123' } });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await app.inject({ url: '/auth/me', headers: auth(staff.token) })).statusCode, 401);
    assert.equal((await login(staff.email, 'senha-do-garcom')).statusCode, 401);
    assert.equal((await login(staff.email, 'nova-senha-123')).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: `/password-resets/${token}`, payload: { password: 'outra-senha-1' } })).statusCode, 404);
  });

  it('não redefine a senha de outro dono nem de quem participa de outro restaurante', async () => {
    const owner = await signup(app);
    const other = await signup(app);
    const { token } = (await invite(owner, { name: other.name, email: other.email })).json();
    await accept(token, { password: other.password }); // other vira funcionário aqui, mas é dono do próprio restaurante
    const reset = (userId: string) =>
      app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/members/${userId}/password-reset`, headers: auth(owner.token) });
    assert.equal((await reset(other.userId)).statusCode, 403);
    assert.equal((await reset(owner.userId)).statusCode, 403);
  });
});
