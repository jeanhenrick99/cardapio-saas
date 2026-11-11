import { Prisma, type PrismaClient, type TabKind } from '@prisma/client';
import { openCashRegisterId } from './cash';
import { checkPayments, paymentsLabel, tabTotals, type Order, type TabPaymentInput } from '@cardapio/shared';

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
/** Trava a conta até o fim da transação e confirma que ainda está aberta. */
async function lockOpenTab(tx: Prisma.TransactionClient, restaurantId: string, tabId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Tab" WHERE id = ${tabId} AND "restaurantId" = ${restaurantId} AND status = 'OPEN' FOR UPDATE`;
  return rows.length === 1;
}

export async function closeTab(
  prisma: PrismaClient,
  restaurantId: string,
  tabId: string,
  input: {
    /** Conta dividida: vários pagamentos que somam o total. */
    payments?: TabPaymentInput[];
    /** Atalho: uma forma só, pelo total da conta. */
    paymentMethod?: string;
    applyServiceFee: boolean;
    discountCents: number;
    closedBy: string;
  },
) {
  const exists = await prisma.tab.findFirst({ where: { id: tabId, restaurantId }, select: { id: true } });
  if (!exists) return { notFound: true as const };
  const [restaurant, cashRegisterId] = await Promise.all([
    prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { serviceFeePercent: true } }),
    openCashRegisterId(prisma, restaurantId),
  ]);

  // Tudo dentro da transação, com a conta travada: um lançamento ou transferência
  // ao mesmo tempo espera, e o total cobrado é o total de verdade.
  return prisma.$transaction(async (tx) => {
    if (!(await lockOpenTab(tx, restaurantId, tabId))) return { alreadyClosed: true as const };
    const orders = await tx.order.findMany({ where: { tabId }, select: { totalCents: true, status: true } });
    const subtotal = orders.filter((o) => o.status !== 'CANCELED').reduce((sum, o) => sum + o.totalCents, 0);
    const totals = tabTotals(subtotal, {
      serviceFeePercent: restaurant.serviceFeePercent,
      applyServiceFee: input.applyServiceFee,
      discountCents: input.discountCents,
    });
    const payments =
      input.payments ?? (input.paymentMethod && totals.totalCents > 0 ? [{ method: input.paymentMethod, amountCents: totals.totalCents }] : []);
    const check = checkPayments(totals.totalCents, payments);
    if (!check.ok) return { paymentMismatch: { totalCents: totals.totalCents, ...check } };

    await tx.tab.update({
      where: { id: tabId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: input.closedBy,
        paymentMethod: payments.length ? paymentsLabel(payments) : null,
        cashRegisterId,
        ...totals,
      },
    });
    await tx.tabPayment.createMany({
      data: payments.map((p) => ({ tabId, method: p.method.trim(), amountCents: p.amountCents, createdBy: input.closedBy })),
    });
    return { totals, payments };
  });
}

/**
 * Transfere lançamentos (pedidos) de uma conta para outra mesa/comanda.
 * - Sem `orderIds`, ou com todos: a conta inteira muda de lugar. Se o destino estiver livre,
 *   a conta só troca de número (mantém a hora de abertura); se estiver ocupado, as contas se juntam.
 * - A conta de origem que fica sem pedidos é apagada.
 */
export async function transferTab(
  prisma: PrismaClient,
  restaurantId: string,
  sourceId: string,
  input: { kind: TabKind; number: string; orderIds?: string[]; by: string },
) {
  const source = await prisma.tab.findFirst({
    where: { id: sourceId, restaurantId },
    include: { orders: { select: { id: true } } },
  });
  if (!source) return { notFound: true as const };
  if (source.status !== 'OPEN') return { closed: true as const };
  const number = normalizeTabNumber(input.number);
  if (source.kind === input.kind && source.number === number) return { sameTab: true as const };

  const all = source.orders.map((o) => o.id);
  const moveIds = input.orderIds ?? all;
  if (moveIds.length === 0 || moveIds.some((id) => !all.includes(id))) return { invalidOrders: true as const };
  const whole = moveIds.length === all.length;
  const type = input.kind === 'MESA' ? 'mesa' : 'comanda';

  const moveOrders = (tx: Prisma.TransactionClient, targetId: string) => tx.$executeRaw`
    UPDATE "Order"
    SET "tabId" = ${targetId}, "type" = ${type},
        "data" = jsonb_set(jsonb_set("data", '{type}', to_jsonb(${type}::text)), '{table}', to_jsonb(${number}::text))
    WHERE id IN (${Prisma.join(moveIds)}) AND "tabId" = ${sourceId}`;

  const freeTarget = !(await prisma.tab.findFirst({ where: { restaurantId, kind: input.kind, number, status: 'OPEN' }, select: { id: true } }));
  if (whole && freeTarget) {
    try {
      const renamed = await prisma.$transaction(async (tx) => {
        if (!(await lockOpenTab(tx, restaurantId, sourceId))) return false;
        await tx.tab.update({ where: { id: sourceId }, data: { kind: input.kind, number } });
        await moveOrders(tx, sourceId);
        return true;
      });
      if (!renamed) return { closed: true as const };
      return { targetId: sourceId, kind: input.kind, number, moved: moveIds.length, merged: false };
    } catch (err) {
      // Alguém abriu a mesa de destino no mesmo instante: cai no caminho de juntar contas.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }

  const targetId = await getOrOpenTab(prisma, restaurantId, input.kind, number, input.by);
  const result = await prisma.$transaction(async (tx) => {
    // Trava as duas contas sempre na mesma ordem (evita deadlock com outra transferência no sentido contrário).
    const [first, second] = [sourceId, targetId].sort();
    if (!(await lockOpenTab(tx, restaurantId, first!)) || !(await lockOpenTab(tx, restaurantId, second!))) return null;
    const moved = await moveOrders(tx, targetId);
    const left = await tx.order.count({ where: { tabId: sourceId } });
    if (left === 0) await tx.tab.delete({ where: { id: sourceId } });
    return moved;
  });
  if (result === null) return { closed: true as const };
  return { targetId, kind: input.kind, number, moved: result, merged: true };
}

export type TabOrderView = Pick<Order, 'id' | 'number' | 'items' | 'origin' | 'staffName' | 'notes'>;
