import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

let seq = 0;

export function newOwnerData() {
  seq++;
  const unique = `${seq}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    name: `Dono ${seq}`,
    email: `dono${unique}@teste.dev`,
    password: 'senha-segura-123',
    restaurant: { name: `Restaurante ${seq}`, slug: `rest-${unique}` },
  };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export async function signup(app: FastifyInstance, data = newOwnerData()) {
  const res = await app.inject({ method: 'POST', url: '/auth/signup', payload: data });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json<{ token: string; user: { id: string } }>();
  return { ...data, slug: data.restaurant.slug, token: body.token, userId: body.user.id, res };
}

/** Cria uma categoria e um produto simples (R$ 10,00, setor cozinha) e devolve o ID do produto. */
export async function createSimpleProduct(app: FastifyInstance, owner: { slug: string; token: string }, priceCents = 1000) {
  const category = await app.inject({
    method: 'POST',
    url: `/restaurants/${owner.slug}/categories`,
    headers: auth(owner.token),
    payload: { name: 'Lanches' },
  });
  assert.equal(category.statusCode, 201, category.body);
  const product = await app.inject({
    method: 'POST',
    url: `/restaurants/${owner.slug}/products`,
    headers: auth(owner.token),
    payload: { categoryId: category.json().id, name: 'Lanche', priceCents },
  });
  assert.equal(product.statusCode, 201, product.body);
  return product.json<{ id: string }>().id;
}

export const tableOrder = (productId: string, quantity = 1) => ({
  type: 'mesa',
  table: '1',
  items: [{ productId, quantity }],
});
