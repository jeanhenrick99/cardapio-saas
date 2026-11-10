/**
 * Testes de integração: API real (Fastify) + PostgreSQL real (banco cardapio_test).
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { prisma } from '../db';

let app: FastifyInstance;

before(async () => {
  app = await buildApp({ logger: false });
});
after(async () => {
  await app.close();
});

let seq = 0;
function newOwner() {
  seq++;
  return {
    name: `Dono ${seq}`,
    email: `dono${seq}-${Date.now()}@teste.dev`,
    password: 'senha-segura-123',
    restaurant: { name: `Restaurante ${seq}`, slug: `rest-${seq}-${Date.now()}` },
  };
}

async function signup(data = newOwner()) {
  const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: data });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json<{ token: string; user: { id: string } }>();
  return { ...data, token: body.token, userId: body.user.id, res };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('cadastro e login', () => {
  it('cadastro cria o dono, o restaurante e já abre uma sessão em cookie seguro', async () => {
    const owner = await signup();
    const me = owner.res.json<{ user: { email: string; restaurants: { slug: string; role: string }[] } }>().user;
    assert.equal(me.email, owner.email);
    assert.deepEqual(me.restaurants.map((r) => [r.slug, r.role]), [[owner.restaurant.slug, 'OWNER']]);

    const cookie = owner.res.cookies.find((c) => c.name === 'session');
    assert.ok(cookie, 'cookie de sessão');
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Lax');
  });

  it('salva o e-mail em minúsculas e a senha só como hash', async () => {
    const data = newOwner();
    await signup({ ...data, email: data.email.toUpperCase() });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: data.email } });
    assert.match(user.passwordHash, /^scrypt\$/);
    assert.ok(!user.passwordHash.includes(data.password));
  });

  it('recusa e-mail e endereço de restaurante duplicados', async () => {
    const owner = await signup();
    const dupEmail = await app.inject({ method: 'POST', url: '/auth/signup', payload: { ...newOwner(), email: owner.email } });
    assert.equal(dupEmail.statusCode, 409);
    assert.match(dupEmail.json().error, /e-mail/);

    const dupSlug = await app.inject({ method: 'POST', url: '/auth/signup', payload: { ...newOwner(), restaurant: owner.restaurant } });
    assert.equal(dupSlug.statusCode, 409);
    assert.match(dupSlug.json().error, /endereço/);
  });

  it('valida a senha mínima', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: { ...newOwner(), password: '123' } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().issues[0].path, 'password');
  });

  it('login errado devolve a mesma mensagem para e-mail inexistente e senha errada', async () => {
    const owner = await signup();
    const wrongPassword = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: owner.email, password: 'errada!!' } });
    const unknownEmail = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ninguem@teste.dev', password: 'errada!!' } });
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownEmail.statusCode, 401);
    assert.deepEqual(wrongPassword.json(), unknownEmail.json());
  });

  it('login funciona por token (Bearer) e por cookie', async () => {
    const owner = await signup();
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: owner.email, password: owner.password } });
    assert.equal(login.statusCode, 200);

    const byBearer = await app.inject({ url: '/auth/me', headers: auth(login.json().token) });
    assert.equal(byBearer.statusCode, 200);

    const sessionCookie = login.cookies.find((c) => c.name === 'session')!;
    const byCookie = await app.inject({ url: '/auth/me', cookies: { session: sessionCookie.value } });
    assert.equal(byCookie.json().email, owner.email);
  });

  it('logout invalida a sessão', async () => {
    const owner = await signup();
    assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: auth(owner.token) })).statusCode, 204);
    assert.equal((await app.inject({ url: '/auth/me', headers: auth(owner.token) })).statusCode, 401);
  });

  it('sessão expirada é recusada', async () => {
    const owner = await signup();
    await prisma.session.updateMany({ where: { userId: owner.userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await app.inject({ url: '/auth/me', headers: auth(owner.token) })).statusCode, 401);
  });

  it('limita tentativas de login (força bruta)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'x-test-rate-limit': '1' },
        payload: { email: 'alvo@teste.dev', password: `tentativa-${i}` },
      });
      statuses.push(res.statusCode);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.equal(statuses[10], 429);
  });
});

describe('permissões por restaurante', () => {
  it('sem login, as rotas do restaurante respondem 401', async () => {
    const owner = await signup();
    const res = await app.inject({ method: 'POST', url: `/restaurants/${owner.restaurant.slug}/orders` });
    assert.equal(res.statusCode, 401);
  });

  it('um dono não enxerga o restaurante de outro (404, sem revelar que existe)', async () => {
    const a = await signup();
    const b = await signup();
    for (const [method, path] of [
      ['POST', 'orders'],
      ['GET', 'print-jobs'],
      ['GET', 'agents'],
      ['POST', 'pairing-codes'],
    ] as const) {
      const res = await app.inject({ method, url: `/restaurants/${a.restaurant.slug}/${path}`, headers: auth(b.token) });
      assert.equal(res.statusCode, 404, `${method} ${path}`);
    }
  });

  it('funcionário (STAFF) cria pedidos, mas não pode parear nem revogar agentes', async () => {
    const owner = await signup();
    const staff = await signup();
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.restaurant.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });

    const order = await app.inject({ method: 'POST', url: `/restaurants/${owner.restaurant.slug}/orders`, headers: auth(staff.token) });
    assert.equal(order.statusCode, 201);

    const pairing = await app.inject({ method: 'POST', url: `/restaurants/${owner.restaurant.slug}/pairing-codes`, headers: auth(staff.token) });
    assert.equal(pairing.statusCode, 403);
  });

  it('pedidos são numerados por restaurante e ficam na fila sem agente', async () => {
    const owner = await signup();
    const numbers: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: 'POST', url: `/restaurants/${owner.restaurant.slug}/orders`, headers: auth(owner.token) });
      assert.equal(res.statusCode, 201);
      assert.equal(res.json().printJob.status, 'QUEUED');
      numbers.push(res.json().order.number);
    }
    assert.deepEqual(numbers, [1, 2, 3]);

    const jobs = await app.inject({ url: `/restaurants/${owner.restaurant.slug}/print-jobs`, headers: auth(owner.token) });
    assert.equal(jobs.json().length, 3);
  });

  it('pedidos simultâneos nunca recebem o mesmo número', async () => {
    const owner = await signup();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({ method: 'POST', url: `/restaurants/${owner.restaurant.slug}/orders`, headers: auth(owner.token) }),
      ),
    );
    const numbers = results.map((r) => r.json().order.number as number).sort((x, y) => x - y);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('dono gera código, agente pareia, código não pode ser reutilizado e revogação funciona', async () => {
    const owner = await signup();
    const { code } = (
      await app.inject({ method: 'POST', url: `/restaurants/${owner.restaurant.slug}/pairing-codes`, headers: auth(owner.token) })
    ).json<{ code: string }>();

    const pair = await app.inject({ method: 'POST', url: '/agents/pair', payload: { code: code.toLowerCase(), name: 'PC teste' } });
    assert.equal(pair.statusCode, 201);
    assert.match(pair.json().token, /^agt_/);

    const reuse = await app.inject({ method: 'POST', url: '/agents/pair', payload: { code } });
    assert.equal(reuse.statusCode, 400);

    const agents = (await app.inject({ url: `/restaurants/${owner.restaurant.slug}/agents`, headers: auth(owner.token) })).json<
      { id: string; name: string; tokenHash?: string }[]
    >();
    assert.equal(agents.length, 1);
    assert.equal(agents[0]?.tokenHash, undefined, 'hash do token nunca sai na API');

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/restaurants/${owner.restaurant.slug}/agents/${agents[0]!.id}`,
      headers: auth(owner.token),
    });
    assert.equal(revoke.statusCode, 204);
  });

  it('usuário logado pode criar outro restaurante e vira o dono', async () => {
    const owner = await signup();
    const slug = `filial-${Date.now()}`;
    const res = await app.inject({ method: 'POST', url: '/restaurants', headers: auth(owner.token), payload: { name: 'Filial', slug } });
    assert.equal(res.statusCode, 201);
    const me = (await app.inject({ url: '/auth/me', headers: auth(owner.token) })).json<{ restaurants: { slug: string; role: string }[] }>();
    assert.deepEqual(me.restaurants.map((r) => r.role), ['OWNER', 'OWNER']);
    assert.ok(me.restaurants.some((r) => r.slug === slug));
  });
});
