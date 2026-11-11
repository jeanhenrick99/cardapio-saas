import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CheckoutSchema, type Order } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { generatePairingCode, hashToken } from '../auth/tokens';
import { prisma } from '../db';
import { placeOrder } from '../orders/checkout';
import { loadRestaurantFor, requireUser } from './common';
import { RestaurantInputSchema } from './schemas';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

const SlugParams = z.object({ slug: z.string() });

/** Configurações da vitrine. Todos os campos são opcionais (PATCH). */
const SettingsBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    logoUrl: z.string().url().max(500).nullable(),
    coverUrl: z.string().url().max(500).nullable(),
    acceptingOrders: z.boolean(),
    pickupMinutes: z.number().int().min(0).max(600),
    deliveryMinutes: z.number().int().min(0).max(600),
    minOrderCents: z.number().int().min(0).max(10_000_000),
  })
  .partial();
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

  /** Configurações atuais da vitrine (para o painel). */
  app.get('/restaurants/:slug/settings', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { lastOrderNumber: _lastOrderNumber, ...settings } = restaurant;
    return settings;
  });

  /**
   * Últimos pedidos com o status da impressão, para a tela de pedidos do painel.
   * O painel consulta esta rota a cada poucos segundos.
   */
  app.get('/restaurants/:slug/orders', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);

    const orders = await prisma.order.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { printJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return orders.map((o) => {
      const data = o.data as unknown as Order;
      const job = o.printJobs[0];
      return {
        ...data,
        totalCents: o.totalCents,
        print: job ? { status: job.status, printers: job.printers, completedAt: job.completedAt } : null,
      };
    });
  });

  /** Abre/fecha o restaurante e ajusta tempos, pedido mínimo e imagens. Só o dono. */
  app.patch('/restaurants/:slug/settings', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const data = SettingsBody.parse(request.body);
    return prisma.restaurant.update({ where: { id: restaurant.id }, data, omit: { lastOrderNumber: true } });
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
