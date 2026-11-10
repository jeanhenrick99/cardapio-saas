import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type PrintJob } from '@prisma/client';
import { OrderSchema, orderTotalCents, type Order, type OrderDraft } from '@cardapio/shared';

/**
 * Cria o pedido e o job de impressão na MESMA transação: se um falhar,
 * nenhum é gravado. O número do pedido vem de um incremento atômico no
 * restaurante, então dois pedidos simultâneos nunca recebem o mesmo número.
 */
export async function createOrder(
  prisma: PrismaClient,
  restaurantId: string,
  draft: OrderDraft,
): Promise<{ order: Order; job: PrintJob }> {
  return prisma.$transaction(async (tx) => {
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
      },
    });
    const job = await tx.printJob.create({ data: { restaurantId, orderId: order.id } });
    return { order, job };
  });
}
