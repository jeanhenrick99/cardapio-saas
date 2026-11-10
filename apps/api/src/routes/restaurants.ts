import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CheckoutSchema } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { generatePairingCode, hashToken } from '../auth/tokens';
import { prisma } from '../db';
import { placeOrder } from '../orders/checkout';
import { loadRestaurantFor, requireUser } from './common';
import { RestaurantInputSchema } from './schemas';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

const SlugParams = z.object({ slug: z.string() });
const AgentParams = SlugParams.extend({ agentId: z.string().uuid() });

export async function restaurantRoutes(app: FastifyInstance, { hub }: { hub: AgentHub }) {
  app.addHook('preHandler', requireUser);

  /** Cria mais um restaurante para o usuário logado, que vira o dono (OWNER). */
  app.post('/restaurants', async (request, reply) => {
    const body = RestaurantInputSchema.parse(request.body);
    const exists = await prisma.restaurant.findUnique({ where: { slug: body.slug } });
    if (exists) return reply.code(409).send({ error: 'Este endereço de restaurante já está em uso' });
    const restaurant = await prisma.restaurant.create({
      data: { ...body, memberships: { create: { userId: request.user!.id, role: 'OWNER' } } },
    });
    return reply.code(201).send(restaurant);
  });

  /** Pedido lançado pela equipe (balcão, telefone). Preços vêm do cardápio, como no pedido público. */
  app.post('/restaurants/:slug/orders', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;

    const checkout = CheckoutSchema.parse(request.body);
    const { order, job, sent } = await placeOrder(prisma, hub, restaurant.id, checkout);
    request.log.info({ orderNumber: order.number, jobId: job.id, sent }, sent ? 'Pedido enviado ao agente' : 'Pedido na fila: agente offline');
    return reply.code(201).send({ order, printJob: { id: job.id, status: sent ? 'SENT' : 'QUEUED' } });
  });

  app.get('/restaurants/:slug/print-jobs', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;

    const jobs = await prisma.printJob.findMany({
      where: { restaurantId: restaurant.id },
      include: { order: { select: { number: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return jobs.map(({ order, orderId: _orderId, restaurantId: _restaurantId, ...job }) => ({ ...job, orderNumber: order.number }));
  });

  /** Gera um código de pareamento de uso único, válido por 10 minutos. */
  app.post('/restaurants/:slug/pairing-codes', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;

    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await prisma.pairingCode.create({ data: { restaurantId: restaurant.id, codeHash: hashToken(code), expiresAt } });
    return reply.code(201).send({ code, expiresAt });
  });

  app.get('/restaurants/:slug/agents', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;

    const agents = await prisma.agent.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      omit: { tokenHash: true },
    });
    return agents.map((a) => ({ ...a, online: hub.isOnline(a.id) }));
  });

  /** Revoga o acesso de um agente (ex.: PC roubado ou trocado). */
  app.delete('/restaurants/:slug/agents/:agentId', async (request, reply) => {
    const { slug, agentId } = AgentParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;

    const { count } = await prisma.agent.updateMany({
      where: { id: agentId, restaurantId: restaurant.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) return reply.code(404).send({ error: 'Agente não encontrado ou já revogado' });
    hub.disconnect(agentId, 'revoked');
    return reply.code(204).send();
  });
}
