import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Order } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { prisma } from '../db';
import { closeTab, normalizeTabNumber, summarizeTab } from '../orders/tabs';
import { loadRestaurantFor, requireUser } from './common';

const SlugParams = z.object({ slug: z.string() });
const TabParams = SlugParams.extend({ id: z.string().uuid() });
const Kind = z.enum(['MESA', 'COMANDA']);
const RECENT_CLOSED_MS = 12 * 60 * 60 * 1000;

const ordersInclude = { orders: { select: { id: true, totalCents: true, status: true, createdAt: true } } } as const;

/** Mesas e comandas (contas). Qualquer membro da equipe usa (PDV). */
export async function tabRoutes(app: FastifyInstance, { hub }: { hub: AgentHub }) {
  app.addHook('preHandler', requireUser);

  /** Contas abertas + fechadas nas últimas 12 h, para a grade do PDV. */
  app.get('/restaurants/:slug/tabs', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { kind } = z.object({ kind: Kind.optional() }).parse(request.query);
    const tabs = await prisma.tab.findMany({
      where: {
        restaurantId: restaurant.id,
        ...(kind ? { kind } : {}),
        OR: [{ status: 'OPEN' }, { status: 'CLOSED', closedAt: { gte: new Date(Date.now() - RECENT_CLOSED_MS) } }],
      },
      include: ordersInclude,
      orderBy: { openedAt: 'asc' },
    });
    const summaries = tabs.map(summarizeTab);
    return {
      tableCount: restaurant.tableCount,
      serviceFeePercent: restaurant.serviceFeePercent,
      open: summaries.filter((t) => t.status === 'OPEN'),
      closed: summaries.filter((t) => t.status === 'CLOSED').reverse(),
    };
  });

  async function tabDetail(restaurantId: string, tabId: string) {
    const tab = await prisma.tab.findFirst({ where: { id: tabId, restaurantId }, include: ordersInclude });
    if (!tab) return null;
    const orders = await prisma.order.findMany({ where: { tabId }, orderBy: { createdAt: 'asc' } });
    return {
      ...summarizeTab(tab),
      orders: orders.map((o) => {
        const data = o.data as unknown as Order;
        return {
          id: o.id,
          number: o.number,
          createdAt: o.createdAt,
          status: o.status,
          totalCents: o.totalCents,
          origin: data.origin ?? 'cardapio',
          staffName: data.staffName,
          notes: data.notes,
          items: data.items,
        };
      }),
    };
  }

  /** Conta aberta de uma mesa/comanda pelo número (404 = livre). */
  app.get('/restaurants/:slug/tabs/current', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { kind, number } = z.object({ kind: Kind, number: z.string().min(1).max(20) }).parse(request.query);
    const open = await prisma.tab.findFirst({
      where: { restaurantId: restaurant.id, kind, number: normalizeTabNumber(number), status: 'OPEN' },
      select: { id: true },
    });
    if (!open) return reply.code(404).send({ error: `${kind === 'MESA' ? 'Mesa' : 'Comanda'} livre` });
    return { ...(await tabDetail(restaurant.id, open.id)), serviceFeePercent: restaurant.serviceFeePercent };
  });

  app.get('/restaurants/:slug/tabs/:id', async (request, reply) => {
    const { slug, id } = TabParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const detail = await tabDetail(restaurant.id, id);
    if (!detail) return reply.code(404).send({ error: 'Conta não encontrada' });
    return { ...detail, serviceFeePercent: restaurant.serviceFeePercent };
  });

  /** Fecha a conta: subtotal dos pedidos (sem cancelados) + taxa de serviço − desconto. */
  app.post('/restaurants/:slug/tabs/:id/close', async (request, reply) => {
    const { slug, id } = TabParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const body = z
      .object({
        paymentMethod: z.string().trim().min(1).max(50),
        applyServiceFee: z.boolean().default(true),
        discountCents: z.number().int().min(0).max(10_000_000).default(0),
      })
      .parse(request.body);
    const result = await closeTab(prisma, restaurant.id, id, { ...body, closedBy: request.user!.name });
    if ('notFound' in result) return reply.code(404).send({ error: 'Conta não encontrada' });
    if ('alreadyClosed' in result) return reply.code(409).send({ error: 'Esta conta já foi fechada.' });
    hub.panel.publish(restaurant.id, { type: 'tabs_changed' });
    return { id, status: 'CLOSED', ...result.totals };
  });
}
