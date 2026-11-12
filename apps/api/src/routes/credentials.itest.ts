/**
 * Acesso por usuário e senha cadastrados pelo dono (e, para o dono, pelo administrador da plataforma).
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
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const login = (id: string, password: string) => app.inject({ method: 'POST', url: '/auth/login', payload: { login: id, password } });
const addMember = (owner: Owner, body: object, token = owner.token) =>
  app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/members`, headers: auth(token), payload: body });

describe('dono cadastra o funcionário com usuário e senha', () => {
  it('o funcionário entra com o usuário (sem e-mail), só no PDV daquele restaurante', async () => {
    const owner = await signup(app);
    const username = `joao.${unique()}`;
    const created = await addMember(owner, { name: 'João Garçom', username: username.toUpperCase(), password: 'senha-do-joao' });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().username, username);

    const res = await login(` ${username.toUpperCase()} `, 'senha-do-joao');
    assert.equal(res.statusCode, 200, res.body);
    const me = res.json().user;
    assert.deepEqual({ email: me.email, username: me.username, restaurants: me.restaurants.map((r: { slug: string; role: string }) => [r.slug, r.role]) }, {
      email: null,
      username,
      restaurants: [[owner.slug, 'STAFF']],
    });
    // funcionário usa as rotas da equipe, mas não as do dono
    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/tabs`, headers: auth(res.json().token) })).statusCode, 200);
    assert.equal((await app.inject({ url: `/restaurants/${owner.slug}/team`, headers: auth(res.json().token) })).statusCode, 403);

    const team = (await app.inject({ url: `/restaurants/${owner.slug}/team`, headers: auth(owner.token) })).json();
    const member = team.members.find((m: { username: string }) => m.username === username);
    assert.deepEqual({ email: member.email, canReset: member.canResetPassword }, { email: null, canReset: true });
  });

  it('senha errada e usuário inexistente dão a mesma resposta; e-mail continua funcionando', async () => {
    const owner = await signup(app);
    const username = `ana.${unique()}`;
    await addMember(owner, { name: 'Ana', username, password: 'senha-da-ana1' });
    const wrong = await login(username, 'senha-errada');
    const missing = await login(`ninguem.${unique()}`, 'senha-errada');
    assert.deepEqual([wrong.statusCode, wrong.json().error], [missing.statusCode, missing.json().error]);
    assert.equal(wrong.statusCode, 401);
    assert.equal((await login(owner.email, owner.password)).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: owner.email, password: owner.password } })).statusCode, 200);
  });

  it('usuário repetido (mesmo em outro restaurante), inválido ou senha curta são recusados; funcionário não cadastra', async () => {
    const owner = await signup(app);
    const other = await signup(app);
    const username = `caixa.${unique()}`;
    assert.equal((await addMember(owner, { name: 'Caixa', username, password: 'senha-do-caixa' })).statusCode, 201);
    assert.equal((await addMember(other, { name: 'Outro', username, password: 'senha-do-outro' })).statusCode, 409);
    assert.equal((await addMember(owner, { name: 'X', username: 'tem espaço', password: 'senha-valida-1' })).statusCode, 400);
    assert.equal((await addMember(owner, { name: 'X', username: 'email@teste.dev', password: 'senha-valida-1' })).statusCode, 400);
    assert.equal((await addMember(owner, { name: 'X', username: `y.${unique()}`, password: '123' })).statusCode, 400);

    const staffToken = (await login(username, 'senha-do-caixa')).json().token;
    assert.equal((await addMember(owner, { name: 'Z', username: `z.${unique()}`, password: 'senha-valida-1' }, staffToken)).statusCode, 403);
  });

  it('dono troca a senha do funcionário: a antiga para de valer e as sessões caem', async () => {
    const owner = await signup(app);
    const username = `bia.${unique()}`;
    const { userId } = (await addMember(owner, { name: 'Bia', username, password: 'senha-antiga-1' })).json();
    const oldToken = (await login(username, 'senha-antiga-1')).json().token;

    const put = (target: string, token: string) =>
      app.inject({ method: 'PUT', url: `/restaurants/${owner.slug}/members/${target}/password`, headers: auth(token), payload: { password: 'senha-nova-123' } });
    assert.equal((await put(userId, oldToken)).statusCode, 403); // funcionário não troca
    assert.equal((await put(owner.userId, owner.token)).statusCode, 403); // nem a de um dono
    assert.equal((await put(userId, owner.token)).statusCode, 204);

    assert.equal((await app.inject({ url: '/auth/me', headers: auth(oldToken) })).statusCode, 401);
    assert.equal((await login(username, 'senha-antiga-1')).statusCode, 401);
    assert.equal((await login(username, 'senha-nova-123')).statusCode, 200);
  });
});

describe('administrador passa o login ao cliente', () => {
  async function adminUser() {
    const user = await signup(app);
    await prisma.user.update({ where: { id: user.userId }, data: { isPlatformAdmin: true } });
    return user;
  }

  it('cadastra o restaurante com usuário e senha do dono; o dono entra e cadastra a equipe', async () => {
    const admin = await adminUser();
    const slug = `cantina-${unique()}`;
    const ownerUsername = `dono.${unique()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/admin/restaurants',
      headers: auth(admin.token),
      payload: { name: 'Cantina', slug, ownerName: 'Paula', ownerUsername, ownerPassword: 'senha-da-paula' },
    });
    assert.equal(res.statusCode, 201, res.body);
    assert.deepEqual(res.json().owner, { name: 'Paula', username: ownerUsername });

    const session = await login(ownerUsername, 'senha-da-paula');
    assert.deepEqual(session.json().user.restaurants.map((r: { slug: string; role: string }) => [r.slug, r.role]), [[slug, 'OWNER']]);
    const staff = await app.inject({
      method: 'POST',
      url: `/restaurants/${slug}/members`,
      headers: auth(session.json().token),
      payload: { name: 'Garçom', username: `garcom.${unique()}`, password: 'senha-garcom-1' },
    });
    assert.equal(staff.statusCode, 201, staff.body);

    const listed = (await app.inject({ url: `/admin/restaurants?q=${ownerUsername}`, headers: auth(admin.token) })).json();
    assert.equal(listed[0].owners[0].username, ownerUsername);
  });

  it('usuário já em uso: recusa e não deixa restaurante órfão; sem login do dono é inválido', async () => {
    const admin = await adminUser();
    const taken = `dono.${unique()}`;
    const post = (slug: string, extra: object) =>
      app.inject({ method: 'POST', url: '/admin/restaurants', headers: auth(admin.token), payload: { name: 'Restaurante', slug, ownerName: 'Dono', ...extra } });
    assert.equal((await post(`a-${unique()}`, { ownerUsername: taken, ownerPassword: 'senha-valida-1' })).statusCode, 201);

    const slug = `b-${unique()}`;
    assert.equal((await post(slug, { ownerUsername: taken, ownerPassword: 'senha-valida-1' })).statusCode, 409);
    assert.equal(await prisma.restaurant.count({ where: { slug } }), 0);
    assert.equal((await post(`c-${unique()}`, {})).statusCode, 400);
  });

  it('em modo suporte, o administrador troca a senha do dono que esqueceu', async () => {
    const admin = await adminUser();
    const slug = `d-${unique()}`;
    const ownerUsername = `dono.${unique()}`;
    await app.inject({
      method: 'POST',
      url: '/admin/restaurants',
      headers: auth(admin.token),
      payload: { name: 'Doceria', slug, ownerName: 'Dono', ownerUsername, ownerPassword: 'senha-esquecida' },
    });
    const team = (await app.inject({ url: `/restaurants/${slug}/team`, headers: auth(admin.token) })).json();
    assert.equal(team.members[0].canResetPassword, true);
    const res = await app.inject({
      method: 'PUT',
      url: `/restaurants/${slug}/members/${team.members[0].userId}/password`,
      headers: auth(admin.token),
      payload: { password: 'senha-nova-do-dono' },
    });
    assert.equal(res.statusCode, 204, res.body);
    assert.equal((await login(ownerUsername, 'senha-nova-do-dono')).statusCode, 200);
  });
});
