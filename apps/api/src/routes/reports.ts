import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildSalesReport, isIsoDay, itemTotalCents, periodRange, type Order } from '@cardapio/shared';
import { prisma } from '../db';
import { loadRestaurantFor, requireUser } from './common';

const MAX_DAYS = 366;
const Day = z.string().refine(isIsoDay, 'Data inválida (use AAAA-MM-DD)');

/** Relatórios da retaguarda (só o dono). */
export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/restaurants/:slug/reports/sales', async (request, reply) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
    if (!restaurant) return;
    const { from, to } = z.object({ from: Day, to: Day }).parse(request.query);
    const { start, end, days } = periodRange(from, to);
    if (days < 1) return reply.code(400).send({ error: 'A data inicial deve ser antes da final.' });
    if (days > MAX_DAYS) return reply.code(400).send({ error: `Escolha um período de até ${MAX_DAYS} dias.` });

    const [orders, tabs, registers] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId: restaurant.id, createdAt: { gte: start, lt: end } },
        select: { type: true, status: true, totalCents: true, createdAt: true, tabId: true, paymentMethod: true, data: true },
      }),
      prisma.tab.findMany({
        where: { restaurantId: restaurant.id, status: 'CLOSED', closedAt: { gte: start, lt: end } },
        select: { closedAt: true, totalCents: true, paymentMethod: true, serviceFeeCents: true, discountCents: true },
      }),
      prisma.cashRegister.findMany({
        where: { restaurantId: restaurant.id, status: 'CLOSED', closedAt: { gte: start, lt: end } },
        orderBy: { closedAt: 'desc' },
      }),
    ]);

    const report = buildSalesReport({
      from,
      to,
      orders: orders.map((o) => ({
        type: o.type,
        status: o.status,
        totalCents: o.totalCents,
        createdAt: o.createdAt,
        tabId: o.tabId,
        paymentMethod: o.paymentMethod,
        items: (o.data as unknown as Order).items.map((i) => ({ name: i.name, quantity: i.quantity, cents: itemTotalCents(i) })),
      })),
      tabs: tabs.map((t) => ({
        closedAt: t.closedAt!,
        totalCents: t.totalCents ?? 0,
        paymentMethod: t.paymentMethod,
        serviceFeeCents: t.serviceFeeCents ?? 0,
        discountCents: t.discountCents ?? 0,
      })),
    });

    return {
      ...report,
      registers: registers.map((r) => ({
        id: r.id,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
        openedBy: r.openedBy,
        closedBy: r.closedBy,
        salesCents: (r.summary as { salesCents?: number } | null)?.salesCents ?? 0,
        expectedCashCents: r.expectedCashCents,
        countedCents: r.countedCents,
        differenceCents: r.countedCents === null || r.expectedCashCents === null ? null : r.countedCents - r.expectedCashCents,
      })),
    };
  });
}
