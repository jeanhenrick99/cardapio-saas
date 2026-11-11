import type { PrismaClient } from '@prisma/client';
import type { Checkout } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { buildOrderDraft, checkRestaurantRules } from '../menu/pricing';
import { loadPricingProducts } from '../menu/queries';
import { createOrder } from './service';

/**
 * Carrinho → preços do banco → pedido + job de impressão → envio ao agente.
 *
 * Pedido da equipe (PDV): fica marcado com o nome de quem lançou e não passa
 * pelas regras do cardápio online ("loja fechada" e pedido mínimo do delivery),
 * que existem para o cliente, não para o balcão/telefone.
 */
export async function placeOrder(
  prisma: PrismaClient,
  hub: AgentHub,
  restaurantId: string,
  checkout: Checkout,
  opts: { staff?: { name: string } } = {},
) {
  const products = await loadPricingProducts(
    prisma,
    restaurantId,
    checkout.items.map((i) => i.productId),
  );
  const draft = buildOrderDraft(checkout, products);
  if (opts.staff) {
    draft.origin = 'pdv';
    draft.staffName = opts.staff.name;
  } else {
    const rules = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { acceptingOrders: true, minOrderCents: true },
    });
    checkRestaurantRules(draft, rules);
  }
  const { order, job } = await createOrder(prisma, restaurantId, draft);
  const sent = await hub.dispatch(job.id);
  hub.panel.publish(restaurantId, { type: 'order_created', orderId: order.id, number: order.number });
  return { order, job, sent };
}
