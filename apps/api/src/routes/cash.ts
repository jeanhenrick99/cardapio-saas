import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentHub } from '../agents/hub';
import { prisma } from '../db';
import { closeRegister, openRegister, summarizeRegister } from '../orders/cash';
import { loadRestaurantFor, requireUser } from './common';

const SlugParams = z.object({ slug: z.string() });
const Cents = z.number().int().min(0).max(100_000_000);

const registerView = (r: {
  id: string;
  status: string;
  openedAt: Date;
  openedBy: string;
  openingCents: number;
  closedAt: Date | null;
  closedBy: string | null;
  countedCents: number | null;
  expectedCashCents: number | null;
  notes: string | null;
}) => ({
  id: r.id,
  status: r.status,
  openedAt: r.openedAt,
  openedBy: r.openedBy,
  openingCents: r.openingCents,
  closedAt: r.closedAt,
  closedBy: r.closedBy,
  countedCents: r.countedCents,
  expectedCashCents: r.expectedCashCents,
  differenceCents: r.countedCents === null || r.expectedCashCents === null ? null : r.countedCents - r.expectedCashCents,
  notes: r.notes,
});

/** Caixa do PDV. Qualquer membro da equipe opera; o dono vê o histórico também nos relatórios. */
export async function cashRoutes(app: FastifyInstance, { hub }: { hub: AgentHub }) {
  app.addHook('preHandler', requireUser);

  async function detail(registerId: string) {
    const register = await prisma.cashRegister.findUniqueOrThrow({
      where: { id: registerId },
      include: { movements: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      ...registerView(register),
      summary: await summarizeRegister(prisma, register),
      movements: register.movements.map((m) => ({
        id: m.id,
        kind: m.kind,
        amountCents: m.amountCents,
        reason: m.reason,
        createdAt: m.createdAt,
        createdBy: m.createdBy,
      })),
    };
  }

  /** Caixa aberto (com resumo ao vivo) + últimos fechamentos. */
  app.get('/restaurants/:slug/cash', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const [open, recent] = await Promise.all([
      prisma.cashRegister.findFirst({ where: { restaurantId: restaurant.id, status: 'OPEN' }, select: { id: true } }),
      prisma.cashRegister.findMany({
        where: { restaurantId: restaurant.id, status: 'CLOSED' },
        orderBy: { closedAt: 'desc' },
        take: 10,
      }),
    ]);
    return { current: open ? await detail(open.id) : null, recent: recent.map(registerView) };
  });

  app.get('/restaurants/:slug/cash/:id', async (request, reply) => {
    const { slug, id } = SlugParams.extend({ id: z.string().uuid() }).parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const found = await prisma.cashRegister.findFirst({ where: { id, restaurantId: restaurant.id }, select: { id: true } });
    if (!found) return reply.code(404).send({ error: 'Caixa não encontrado' });
    return detail(found.id);
  });

  app.post('/restaurants/:slug/cash/open', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const { openingCents } = z.object({ openingCents: Cents }).parse(request.body);
    const register = await openRegister(prisma, restaurant.id, { openingCents, openedBy: request.user!.name });
    if (!register) return reply.code(409).send({ error: 'Já existe um caixa aberto.' });
    hub.panel.publish(restaurant.id, { type: 'cash_changed' });
    return reply.code(201).send(await detail(register.id));
  });

  app.post('/restaurants/:slug/cash/movements', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const body = z
      .object({
        kind: z.enum(['SANGRIA', 'SUPRIMENTO']),
        amountCents: Cents.min(1),
        reason: z.string().trim().min(2, 'Informe o motivo').max(200),
      })
      .parse(request.body);
    const register = await prisma.cashRegister.findFirst({ where: { restaurantId: restaurant.id, status: 'OPEN' } });
    if (!register) return reply.code(409).send({ error: 'Abra o caixa antes de registrar sangria ou suprimento.' });
    if (body.kind === 'SANGRIA') {
      const { expectedCashCents } = await summarizeRegister(prisma, register);
      if (body.amountCents > expectedCashCents) {
        return reply.code(422).send({ error: 'A sangria é maior que o dinheiro que deveria estar no caixa.' });
      }
    }
    await prisma.cashMovement.create({ data: { registerId: register.id, ...body, createdBy: request.user!.name } });
    hub.panel.publish(restaurant.id, { type: 'cash_changed' });
    return reply.code(201).send(await detail(register.id));
  });

  app.post('/restaurants/:slug/cash/close', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await loadRestaurantFor(request, reply, slug);
    if (!restaurant) return;
    const body = z.object({ countedCents: Cents, notes: z.string().trim().max(500).optional() }).parse(request.body);
    const register = await prisma.cashRegister.findFirst({ where: { restaurantId: restaurant.id, status: 'OPEN' } });
    if (!register) return reply.code(409).send({ error: 'Não há caixa aberto.' });
    const summary = await closeRegister(prisma, register, { ...body, closedBy: request.user!.name });
    if (!summary) return reply.code(409).send({ error: 'Este caixa já foi fechado.' });
    hub.panel.publish(restaurant.id, { type: 'cash_changed' });
    return detail(register.id);
  });
}
