import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { requireUser } from './common';
import { EmailSchema, RestaurantInputSchema } from './schemas';
import { createInvite } from './team';

const SlugParams = z.object({ slug: z.string() });

/** Só administradores da plataforma. Os demais recebem 404: a área nem aparece existir. */
async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.isPlatformAdmin) return reply.code(404).send({ error: 'Não encontrado' });
}

/**
 * Administração da plataforma (suporte): lista e cadastra restaurantes, gera o link de
 * acesso do dono e registra cada entrada na base de um cliente.
 * O acesso aos dados do restaurante em si usa as rotas normais (ver loadRestaurantFor).
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);
  app.addHook('preHandler', requirePlatformAdmin);

  app.get('/admin/restaurants', async (request) => {
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(request.query);
    const restaurants = await prisma.restaurant.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q.toLowerCase() } },
              { memberships: { some: { user: { email: { contains: q.toLowerCase() } } } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        memberships: { where: { role: 'OWNER' }, select: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        invites: { where: { role: 'OWNER', acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true } },
        supportAccesses: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, user: { select: { name: true } } } },
        _count: { select: { memberships: true, orders: true } },
      },
    });
    const lastOrders = await prisma.order.groupBy({
      by: ['restaurantId'],
      where: { restaurantId: { in: restaurants.map((r) => r.id) } },
      _max: { createdAt: true },
    });
    const lastOrderAt = new Map(lastOrders.map((o) => [o.restaurantId, o._max.createdAt]));

    return restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt,
      acceptingOrders: r.acceptingOrders,
      owners: r.memberships.map((m) => m.user),
      pendingOwnerInvites: r.invites.map((i) => i.email),
      membersCount: r._count.memberships,
      ordersCount: r._count.orders,
      lastOrderAt: lastOrderAt.get(r.id) ?? null,
      lastSupportAccess: r.supportAccesses[0] ? { at: r.supportAccesses[0].createdAt, by: r.supportAccesses[0].user.name } : null,
    }));
  });

  /** Cadastra o restaurante de um cliente e gera o link para o dono criar a senha. */
  app.post('/admin/restaurants', async (request, reply) => {
    const body = RestaurantInputSchema.extend({ ownerName: z.string().trim().min(2).max(100), ownerEmail: EmailSchema }).parse(request.body);
    try {
      const restaurant = await prisma.restaurant.create({ data: { name: body.name, slug: body.slug } });
      const { invite, token } = await createInvite(restaurant.id, {
        name: body.ownerName,
        email: body.ownerEmail,
        role: 'OWNER',
        createdBy: request.user!.name,
      });
      return reply.code(201).send({ id: restaurant.id, name: restaurant.name, slug: restaurant.slug, owner: { name: invite.name, email: invite.email }, token, expiresAt: invite.expiresAt });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: 'Este endereço de restaurante já está em uso' });
      }
      throw err;
    }
  });

  /** Novo link de dono (o cliente perdeu o acesso, trocou de responsável ou o primeiro link venceu). */
  app.post('/admin/restaurants/:slug/owner-invite', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const body = z.object({ name: z.string().trim().min(2).max(100), email: EmailSchema }).parse(request.body);
    const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
    if (!restaurant) return reply.code(404).send({ error: 'Restaurante não encontrado' });
    const already = await prisma.membership.findFirst({ where: { restaurantId: restaurant.id, role: 'OWNER', user: { email: body.email } } });
    if (already) return reply.code(409).send({ error: 'Esta pessoa já é dona deste restaurante.' });
    const { invite, token } = await createInvite(restaurant.id, { ...body, role: 'OWNER', createdBy: request.user!.name });
    return reply.code(201).send({ owner: { name: invite.name, email: invite.email }, token, expiresAt: invite.expiresAt });
  });

  /** Registra a entrada do suporte na base do cliente e devolve o básico para montar a tela. */
  app.post('/admin/restaurants/:slug/enter', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
    if (!restaurant) return reply.code(404).send({ error: 'Restaurante não encontrado' });
    await prisma.supportAccess.create({ data: { userId: request.user!.id, restaurantId: restaurant.id } });
    return restaurant;
  });

  /** Básico de um restaurante (nome), para as telas do modo suporte. */
  app.get('/admin/restaurants/:slug', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
    if (!restaurant) return reply.code(404).send({ error: 'Restaurante não encontrado' });
    return restaurant;
  });
}
