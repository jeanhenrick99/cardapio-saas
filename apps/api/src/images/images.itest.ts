/**
 * Testes de integração do envio de fotos (API + PostgreSQL).
 * Rode com: npm run test:integration
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PublicMenu } from '@cardapio/shared';
import { buildApp } from '../app';
import { prisma } from '../db';
import { auth, signup } from '../test/helpers';
import { IMAGE_MAX_BYTES } from './storage';
import { TINY_PNG, TINY_WEBP } from './fixtures';

let app: FastifyInstance;
before(async () => {
  app = await buildApp({ logger: false });
});
after(async () => {
  await app.close();
});

const upload = (slug: string, token: string | null, body: Buffer, contentType = 'image/webp') =>
  app.inject({
    method: 'POST',
    url: `/restaurants/${slug}/images`,
    headers: { 'content-type': contentType, ...(token ? auth(token) : {}) },
    payload: body,
  });

describe('envio de fotos', () => {
  it('o dono envia uma foto e ela é servida com cache longo', async () => {
    const owner = await signup(app);
    const res = await upload(owner.slug, owner.token, TINY_WEBP);
    assert.equal(res.statusCode, 201, res.body);
    const { id, url, size } = res.json<{ id: string; url: string; size: number }>();
    assert.equal(url, `/api/images/${id}`);
    assert.equal(size, TINY_WEBP.length);

    const served = await app.inject({ url: `/images/${id}` });
    assert.equal(served.statusCode, 200);
    assert.equal(served.headers['content-type'], 'image/webp');
    assert.match(String(served.headers['cache-control']), /immutable/);
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    assert.ok(served.rawPayload.equals(TINY_WEBP), 'devolve exatamente os mesmos bytes');
  });

  it('usa o tipo real do arquivo, não o declarado', async () => {
    const owner = await signup(app);
    const res = await upload(owner.slug, owner.token, TINY_PNG, 'image/webp');
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().contentType, 'image/png');
  });

  it('recusa arquivo que não é imagem, mesmo declarado como imagem', async () => {
    const owner = await signup(app);
    const res = await upload(owner.slug, owner.token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'image/png');
    assert.equal(res.statusCode, 415);
  });

  it('recusa tipos não aceitos e arquivos grandes demais', async () => {
    const owner = await signup(app);
    assert.equal((await upload(owner.slug, owner.token, TINY_WEBP, 'image/svg+xml')).statusCode, 415);
    const big = Buffer.concat([TINY_WEBP, Buffer.alloc(IMAGE_MAX_BYTES + 1)]);
    assert.equal((await upload(owner.slug, owner.token, big)).statusCode, 413);
  });

  it('exige login, ser membro e ser dono', async () => {
    const owner = await signup(app);
    const outsider = await signup(app);
    const staff = await signup(app);
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { slug: owner.slug } });
    await prisma.membership.create({ data: { userId: staff.userId, restaurantId: restaurant.id, role: 'STAFF' } });

    assert.equal((await upload(owner.slug, null, TINY_WEBP)).statusCode, 401);
    assert.equal((await upload(owner.slug, outsider.token, TINY_WEBP)).statusCode, 404);
    assert.equal((await upload(owner.slug, staff.token, TINY_WEBP)).statusCode, 403);
  });

  it('foto inexistente ou ID inválido responde 404', async () => {
    assert.equal((await app.inject({ url: '/images/3f2a1b4c-1d2e-4f5a-8b9c-0d1e2f3a4b5c' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/images/nao-e-um-id' })).statusCode, 404);
  });
});

describe('fotos no cardápio e na loja', () => {
  it('produto, logo e capa aceitam a foto enviada e ela aparece no cardápio público', async () => {
    const owner = await signup(app);
    const { url } = (await upload(owner.slug, owner.token, TINY_WEBP)).json<{ url: string }>();

    const category = (
      await app.inject({ method: 'POST', url: `/restaurants/${owner.slug}/categories`, headers: auth(owner.token), payload: { name: 'Pratos' } })
    ).json<{ id: string }>();
    const product = await app.inject({
      method: 'POST',
      url: `/restaurants/${owner.slug}/products`,
      headers: auth(owner.token),
      payload: { categoryId: category.id, name: 'Salmão grelhado', priceCents: 7900, imageUrl: url },
    });
    assert.equal(product.statusCode, 201, product.body);

    const settings = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/settings`,
      headers: auth(owner.token),
      payload: { logoUrl: url, coverUrl: url },
    });
    assert.equal(settings.statusCode, 200, settings.body);

    const menu = (await app.inject({ url: `/public/restaurants/${owner.slug}/menu` })).json<PublicMenu>();
    assert.equal(menu.categories[0]!.products[0]!.imageUrl, url);
    assert.equal(menu.restaurant.logoUrl, url);
    assert.equal(menu.restaurant.coverUrl, url);
  });

  it('recusa caminhos que não são fotos (ex.: outra rota da API)', async () => {
    const owner = await signup(app);
    const res = await app.inject({
      method: 'PATCH',
      url: `/restaurants/${owner.slug}/settings`,
      headers: auth(owner.token),
      payload: { logoUrl: '/api/auth/logout' },
    });
    assert.equal(res.statusCode, 400);
  });
});
