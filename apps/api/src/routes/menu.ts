import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { loadAdminMenu } from '../menu/queries';
import { loadRestaurantFor, requireUser } from './common';
import { ImageRefSchema } from './schemas';

const SlugParams = z.object({ slug: z.string() });
const IdParams = SlugParams.extend({ id: z.string().uuid() });

const cents = z.number().int().min(0).max(10_000_000);

const CategoryBody = z.object({
  name: z.string().trim().min(1).max(80),
  position: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});

const OptionBody = z.object({
  name: z.string().trim().min(1).max(80),
  priceCents: cents.default(0),
  active: z.boolean().default(true),
});

const OptionGroupBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    minSelect: z.number().int().min(0).max(50).default(0),
    maxSelect: z.number().int().min(1).max(50).default(1),
    options: z.array(OptionBody).min(1).max(50),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'O mínimo não pode ser maior que o máximo', path: ['minSelect'] })
  .refine((g) => g.minSelect <= g.options.length, { message: 'O mínimo é maior que o número de opções', path: ['minSelect'] });

const ProductBody = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  priceCents: cents,
  sector: z.string().trim().toLowerCase().min(1).max(30).default('cozinha'),
  position: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  imageUrl: ImageRefSchema.nullish(),
  optionGroups: z.array(OptionGroupBody).max(20).default([]),
});

type ProductInput = z.infer<typeof ProductBody>;

/** Grupos e opções aninhados, com a posição definida pela ordem do array. */
const nestedGroups = (groups: ProductInput['optionGroups']) => ({
  create: groups.map((g, gi) => ({
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    position: gi,
    options: { create: g.options.map((o, oi) => ({ ...o, position: oi })) },
  })),
});

const productInclude = {
  optionGroups: { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' } } } },
} as const;

/**
 * Gestão do cardápio. Ler: qualquer membro. Editar: só o dono.
 * Exceção: marcar produto como esgotado/disponível também é liberado para
 * funcionários, que é o que acontece no dia a dia do salão.
 *
 * Toda consulta filtra por restaurantId: um restaurante nunca altera
 * categorias ou produtos de outro, mesmo conhecendo os IDs.
 */
export async function menuRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/restaurants/:slug/menu', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    return loadAdminMenu(prisma, restaurant.id);
  });

  // ---------- Categorias ----------

  app.post('/restaurants/:slug/categories', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const body = CategoryBody.parse(request.body);
    return reply.code(201).send(await prisma.category.create({ data: { ...body, restaurantId: restaurant.id } }));
  });

  app.patch('/restaurants/:slug/categories/:id', async (request, reply) => {
    const { slug, id } = IdParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const body = CategoryBody.partial().parse(request.body);
    const { count } = await prisma.category.updateMany({ where: { id, restaurantId: restaurant.id }, data: body });
    if (count === 0) return reply.code(404).send({ error: 'Categoria não encontrada' });
    return prisma.category.findUniqueOrThrow({ where: { id } });
  });

  app.delete('/restaurants/:slug/categories/:id', async (request, reply) => {
    const { slug, id } = IdParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const category = await prisma.category.findFirst({
      where: { id, restaurantId: restaurant.id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) return reply.code(404).send({ error: 'Categoria não encontrada' });
    // Evita apagar produtos sem querer: a categoria precisa estar vazia.
    if (category._count.products > 0) {
      return reply.code(409).send({ error: 'Remova ou mova os produtos antes de apagar a categoria' });
    }
    await prisma.category.delete({ where: { id } });
    return reply.code(204).send();
  });

  // ---------- Produtos ----------

  async function assertCategory(restaurantId: string, categoryId: string) {
    return prisma.category.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } });
  }

  app.post('/restaurants/:slug/products', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const { optionGroups, ...body } = ProductBody.parse(request.body);
    if (!(await assertCategory(restaurant.id, body.categoryId))) {
      return reply.code(400).send({ error: 'Categoria não encontrada neste restaurante' });
    }
    const product = await prisma.product.create({
      data: { ...body, restaurantId: restaurant.id, optionGroups: nestedGroups(optionGroups) },
      include: productInclude,
    });
    return reply.code(201).send(product);
  });

  /** Substitui o produto inteiro, incluindo os complementos (mais simples e previsível que um diff). */
  app.put('/restaurants/:slug/products/:id', async (request, reply) => {
    const { slug, id } = IdParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const { optionGroups, ...body } = ProductBody.parse(request.body);
    if (!(await assertCategory(restaurant.id, body.categoryId))) {
      return reply.code(400).send({ error: 'Categoria não encontrada neste restaurante' });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.product.updateMany({ where: { id, restaurantId: restaurant.id }, data: body });
      if (count === 0) return null;
      await tx.optionGroup.deleteMany({ where: { productId: id } });
      return tx.product.update({ where: { id }, data: { optionGroups: nestedGroups(optionGroups) }, include: productInclude });
    });
    if (!updated) return reply.code(404).send({ error: 'Produto não encontrado' });
    return updated;
  });

  /** Esgotado / disponível. Liberado também para funcionários. */
  app.patch('/restaurants/:slug/products/:id/availability', async (request, reply) => {
    const { slug, id } = IdParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { active } = z.object({ active: z.boolean() }).parse(request.body);
    const { count } = await prisma.product.updateMany({ where: { id, restaurantId: restaurant.id }, data: { active } });
    if (count === 0) return reply.code(404).send({ error: 'Produto não encontrado' });
    return { id, active };
  });

  app.delete('/restaurants/:slug/products/:id', async (request, reply) => {
    const { slug, id } = IdParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    // Pedidos antigos guardam uma cópia do produto, então apagar não afeta o histórico.
    const { count } = await prisma.product.deleteMany({ where: { id, restaurantId: restaurant.id } });
    if (count === 0) return reply.code(404).send({ error: 'Produto não encontrado' });
    return reply.code(204).send();
  });
}
