import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canTransition, CheckoutSchema, isSearchablePhone, ORDER_STATUSES, samePhone, statusLabel, type Order, type OrderType } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { generatePairingCode, hashToken } from '../auth/tokens';
import { prisma } from '../db';
import { placeOrder } from '../orders/checkout';
import { loadRestaurantFor, requireUser } from './common';
import { ImageRefSchema, RestaurantInputSchema } from './schemas';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, saveImage, sniffImageType } from '../images/storage';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

const SlugParams = z.object({ slug: z.string() });

/** Configurações da vitrine. Todos os campos são opcionais (PATCH). */
const SettingsBody = z
  .object({
    name: z.string().trim().min(2).max(100),
    logoUrl: ImageRefSchema.nullable(),
    coverUrl: ImageRefSchema.nullable(),
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

  /** Pedido lançado pela equipe no PDV (balcão, telefone, mesa). Preços vêm do cardápio, como no pedido público. */
  app.post('/restaurants/:slug/orders', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;

    const checkout = CheckoutSchema.parse(request.body);
    const { order, job, sent } = await placeOrder(prisma, hub, restaurant.id, checkout, { staff: { name: request.user!.name } });
    request.log.info({ orderNumber: order.number, jobId: job.id, sent }, sent ? 'Pedido enviado ao agente' : 'Pedido na fila: agente offline');
    return reply.code(201).send({ order, printJob: { id: job.id, status: sent ? 'SENT' : 'QUEUED' } });
  });

  /**
   * Passe de uso único (60 s) para o painel abrir a conexão ao vivo em /panel/live.
   * Esta rota usa o cookie de login; a conexão WebSocket (em outro domínio) usa só o passe.
   */
  app.post('/restaurants/:slug/live-token', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    return hub.panel.issueToken(restaurant.id);
  });

  // Fotos chegam como bytes crus (Content-Type image/webp, image/jpeg ou image/png).
  app.addContentTypeParser([...IMAGE_TYPES], { parseAs: 'buffer', bodyLimit: IMAGE_MAX_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  /** Envia uma foto (produto, logo ou capa). Só o dono. Devolve o caminho para usar em imageUrl/logoUrl/coverUrl. */
  app.post('/restaurants/:slug/images', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0) return reply.code(400).send({ error: 'Envie o arquivo da foto' });
    const type = sniffImageType(data);
    if (!type) return reply.code(415).send({ error: 'O arquivo não é uma foto válida (use JPG, PNG ou WebP)' });
    return reply.code(201).send(await saveImage(prisma, restaurant.id, data, type));
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
  /**
   * Pedidos para o painel, com etapa e status da impressão.
   *   ?view=board → quadro de delivery/retirada: os em andamento + os concluídos nas últimas 12 h
   */
  app.get('/restaurants/:slug/orders', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { limit, view } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50), view: z.enum(['list', 'board']).default('list') })
      .parse(request.query);

    const board = view === 'board';
    const orders = await prisma.order.findMany({
      where: board
        ? {
            restaurantId: restaurant.id,
            type: { in: ['delivery', 'retirada'] },
            OR: [
              { status: { in: ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] } },
              { status: 'COMPLETED', statusChangedAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
            ],
          }
        : { restaurantId: restaurant.id },
      orderBy: { createdAt: board ? 'asc' : 'desc' },
      take: board ? 200 : limit,
      include: { printJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return orders.map((o) => {
      const data = o.data as unknown as Order;
      const job = o.printJobs[0];
      return {
        ...data,
        totalCents: o.totalCents,
        status: o.status,
        statusChangedAt: o.statusChangedAt,
        print: job ? { status: job.status, printers: job.printers, completedAt: job.completedAt } : null,
      };
    });
  });

  /**
   * Muda a etapa do pedido (Kanban). Qualquer membro da equipe pode.
   * As regras (avançar/voltar uma etapa, cancelar) são as mesmas do painel.
   */
  app.patch('/restaurants/:slug/orders/:id/status', async (request, reply) => {
    const { slug, id } = z.object({ slug: z.string(), id: z.string().uuid() }).parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { status } = z.object({ status: z.enum(ORDER_STATUSES) }).parse(request.body);

    const order = await prisma.order.findFirst({ where: { id, restaurantId: restaurant.id }, select: { type: true, status: true } });
    if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' });
    const type = order.type as OrderType;
    if (!canTransition(type, order.status, status)) {
      return reply.code(409).send({
        error: `Não é possível mudar de "${statusLabel(order.status, type)}" para "${statusLabel(status, type)}"`,
      });
    }

    // Só atualiza se ninguém mudou o pedido nesse meio tempo (dois funcionários no mesmo quadro).
    const { count } = await prisma.order.updateMany({
      where: { id, restaurantId: restaurant.id, status: order.status },
      data: { status, statusChangedAt: new Date() },
    });
    if (count === 0) return reply.code(409).send({ error: 'O pedido foi alterado por outra pessoa. A tela foi atualizada.' });

    hub.panel.publish(restaurant.id, { type: 'order_status', orderId: id, status });
    return { id, status };
  });

  /**
   * Busca um cliente que já pediu, pelo telefone (PDV: preenche nome e endereço).
   * Olha os pedidos mais recentes do próprio restaurante, nunca de outro.
   */
  app.get('/restaurants/:slug/customers', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { phone } = z.object({ phone: z.string().max(30) }).parse(request.query);
    if (!isSearchablePhone(phone)) return reply.code(400).send({ error: 'Informe o telefone com DDD' });

    const recent = await prisma.order.findMany({
      where: { restaurantId: restaurant.id, type: { in: ['delivery', 'retirada'] } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { data: true, createdAt: true },
    });
    const matches = recent
      .map((o) => ({ customer: (o.data as unknown as Order).customer, createdAt: o.createdAt }))
      .filter((o) => o.customer?.phone && samePhone(o.customer.phone, phone));
    const latest = matches[0];
    if (!latest?.customer) return reply.code(404).send({ error: 'Cliente ainda não fez pedidos' });
    // Endereço: o mais recente que tiver endereço (o último pedido pode ter sido retirada).
    const address = matches.find((m) => m.customer?.address)?.customer?.address ?? null;
    return {
      name: latest.customer.name,
      phone: latest.customer.phone,
      address,
      orders: matches.length,
      lastOrderAt: latest.createdAt,
    };
  });

  /** Abre/fecha o restaurante e ajusta tempos, pedido mínimo e imagens. Só o dono. */
  app.patch('/restaurants/:slug/settings', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const data = SettingsBody.parse(request.body);
    const updated = await prisma.restaurant.update({ where: { id: restaurant.id }, data, omit: { lastOrderNumber: true } });
    hub.panel.publish(restaurant.id, { type: 'store_updated' });
    return updated;
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
