import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type PrintJob } from '@prisma/client';
import { OrderSchema, orderTotalCents, type Order, type OrderDraft } from '@cardapio/shared';

/** A conta foi fechada entre a busca e o lançamento: quem chama abre outra e tenta de novo. */
export class TabClosedError extends Error {}

/**
 * Cria o pedido e o job de impressão na MESMA transação: se um falhar,
 * nenhum é gravado. O número do pedido vem de um incremento atômico no
 * restaurante, então dois pedidos simultâneos nunca recebem o mesmo número.
 */
export async function createOrder(
  prisma: PrismaClient,
  restaurantId: string,
  draft: OrderDraft,
  opts: { tabId?: string; cashRegisterId?: string | null } = {},
): Promise<{ order: Order; job: PrintJob }> {
  return prisma.$transaction(async (tx) => {
    if (opts.tabId) {
      // FOR SHARE espera um fechamento/transferência em andamento; se a conta acabou de fechar, avisa.
      const open = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Tab" WHERE id = ${opts.tabId} AND status = 'OPEN' FOR SHARE`;
      if (open.length === 0) throw new TabClosedError();
    }
    const { lastOrderNumber } = await tx.restaurant.update({
      where: { id: restaurantId },
      data: { lastOrderNumber: { increment: 1 } },
      select: { lastOrderNumber: true },
    });

    const createdAt = new Date();
    const order = OrderSchema.parse({
      ...draft,
      id: randomUUID(),
      number: lastOrderNumber,
      createdAt: createdAt.toISOString(),
    });

    await tx.order.create({
      data: {
        id: order.id,
        restaurantId,
        number: order.number,
        type: order.type,
        totalCents: orderTotalCents(order),
        data: order as unknown as Prisma.InputJsonValue,
        createdAt,
        tabId: opts.tabId ?? null,
        paymentMethod: order.paymentMethod ?? null,
        // Pedido avulso entra no caixa aberto; o de mesa/comanda entra quando a conta for fechada.
        cashRegisterId: opts.tabId ? null : (opts.cashRegisterId ?? null),
      },
    });
    const job = await tx.printJob.create({ data: { restaurantId, orderId: order.id } });
    return { order, job };
  });
}
