import { Prisma, type CashRegister, type PrismaClient } from '@prisma/client';
import { cashSummary, type CashSummary } from '@cardapio/shared';

/** Id do caixa aberto agora (ou null). As vendas feitas com ele aberto ficam ligadas a ele. */
export async function openCashRegisterId(prisma: PrismaClient, restaurantId: string): Promise<string | null> {
  const open = await prisma.cashRegister.findFirst({ where: { restaurantId, status: 'OPEN' }, select: { id: true } });
  return open?.id ?? null;
}

/** Recebimentos do caixa: pedidos avulsos não cancelados + contas de mesa/comanda fechadas nele. */
async function receiptsOf(prisma: PrismaClient, registerId: string) {
  const [orders, tabs] = await Promise.all([
    prisma.order.findMany({
      where: { cashRegisterId: registerId, tabId: null, status: { not: 'CANCELED' } },
      select: { paymentMethod: true, totalCents: true },
    }),
    // Conta dividida: cada pagamento entra na sua forma (a parte em dinheiro vai para a gaveta).
    prisma.tabPayment.findMany({ where: { tab: { cashRegisterId: registerId, status: 'CLOSED' } }, select: { method: true, amountCents: true } }),
  ]);
  return [
    ...orders.map((o) => ({ paymentMethod: o.paymentMethod, amountCents: o.totalCents })),
    ...tabs.map((p) => ({ paymentMethod: p.method, amountCents: p.amountCents })),
  ];
}

/** Resumo calculado na hora (caixa aberto) ou o gravado no fechamento (caixa fechado). */
export async function summarizeRegister(prisma: PrismaClient, register: CashRegister, countedCents?: number): Promise<CashSummary> {
  if (register.status === 'CLOSED' && register.summary && countedCents === undefined) {
    return register.summary as unknown as CashSummary;
  }
  const [receipts, movements] = await Promise.all([
    receiptsOf(prisma, register.id),
    prisma.cashMovement.findMany({ where: { registerId: register.id }, select: { kind: true, amountCents: true } }),
  ]);
  return cashSummary({ openingCents: register.openingCents, receipts, movements, countedCents });
}

export async function openRegister(prisma: PrismaClient, restaurantId: string, input: { openingCents: number; openedBy: string }) {
  try {
    return await prisma.cashRegister.create({ data: { restaurantId, ...input } });
  } catch (err) {
    // Índice único parcial: já existe um caixa aberto.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

export async function closeRegister(
  prisma: PrismaClient,
  register: CashRegister,
  input: { countedCents: number; closedBy: string; notes?: string },
): Promise<CashSummary | null> {
  const summary = await summarizeRegister(prisma, register, input.countedCents);
  // Só fecha se ainda estiver aberto (dois cliques em "Fechar": um vence).
  const { count } = await prisma.cashRegister.updateMany({
    where: { id: register.id, status: 'OPEN' },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedBy: input.closedBy,
      countedCents: input.countedCents,
      expectedCashCents: summary.expectedCashCents,
      summary: summary as unknown as Prisma.InputJsonValue,
      notes: input.notes || null,
    },
  });
  return count === 0 ? null : summary;
}
