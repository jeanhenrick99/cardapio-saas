import { Prisma, type PrismaClient, type TabKind } from '@prisma/client';
import { tabTotals, type Order } from '@cardapio/shared';

/** "07" e "7" são a mesma mesa; comanda "A12" fica como está (em maiúsculas). */
export function normalizeTabNumber(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed.toUpperCase();
}

/**
 * Devolve a conta ABERTA da mesa/comanda, abrindo uma se não existir.
 * Se dois lançamentos chegarem juntos, o índice único parcial do banco recusa a
 * segunda conta (P2002) e aqui reaproveitamos a que acabou de ser criada.
 */
export async function getOrOpenTab(
  prisma: PrismaClient,
  restaurantId: string,
  kind: TabKind,
  number: string,
  openedBy: string,
): Promise<string> {
  const findOpen = () =>
    prisma.tab.findFirst({ where: { restaurantId, kind, number, status: 'OPEN' }, select: { id: true } });
  const existing = await findOpen();
  if (existing) return existing.id;
  try {
    return (await prisma.tab.create({ data: { restaurantId, kind, number, openedBy }, select: { id: true } })).id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const again = await findOpen();
      if (again) return again.id;
    }
    throw err;
  }
}

type TabWithOrders = Prisma.TabGetPayload<{
  include: { orders: { select: { id: true; totalCents: true; status: true; createdAt: true } } };
}>;

/** Resumo para a grade de mesas/comandas. Pedidos cancelados não entram no consumo. */
export function summarizeTab(tab: TabWithOrders) {
  const valid = tab.orders.filter((o) => o.status !== 'CANCELED');
  const consumedCents = valid.reduce((sum, o) => sum + o.totalCents, 0);
  const lastOrderAt = valid.reduce<Date | null>((last, o) => (!last || o.createdAt > last ? o.createdAt : last), null);
  return {
    id: tab.id,
    kind: tab.kind,
    number: tab.number,
    status: tab.status,
    openedAt: tab.openedAt,
    openedBy: tab.openedBy,
    closedAt: tab.closedAt,
    closedBy: tab.closedBy,
    ordersCount: valid.length,
    consumedCents,
    lastOrderAt,
    paymentMethod: tab.paymentMethod,
    subtotalCents: tab.subtotalCents,
    serviceFeeCents: tab.serviceFeeCents,
    discountCents: tab.discountCents,
    totalCents: tab.totalCents,
  };
}

/** Calcula e grava o fechamento. Devolve null se a conta já não estava aberta. */
export async function closeTab(
  prisma: PrismaClient,
  restaurantId: string,
  tabId: string,
  input: { paymentMethod: string; applyServiceFee: boolean; discountCents: number; closedBy: string },
) {
  const [tab, restaurant] = await Promise.all([
    prisma.tab.findFirst({
      where: { id: tabId, restaurantId },
      include: { orders: { select: { totalCents: true, status: true } } },
    }),
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { serviceFeePercent: true } }),
  ]);
  if (!tab) return { notFound: true as const };
  const subtotal = tab.orders.filter((o) => o.status !== 'CANCELED').reduce((sum, o) => sum + o.totalCents, 0);
  const totals = tabTotals(subtotal, {
    serviceFeePercent: restaurant.serviceFeePercent,
    applyServiceFee: input.applyServiceFee,
    discountCents: input.discountCents,
  });
  // Só fecha se ainda estiver aberta (dois caixas fechando ao mesmo tempo: um vence).
  const { count } = await prisma.tab.updateMany({
    where: { id: tabId, restaurantId, status: 'OPEN' },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedBy: input.closedBy,
      paymentMethod: input.paymentMethod,
      ...totals,
    },
  });
  return count === 0 ? { alreadyClosed: true as const } : { totals };
}

export type TabOrderView = Pick<Order, 'id' | 'number' | 'items' | 'origin' | 'staffName' | 'notes'>;
