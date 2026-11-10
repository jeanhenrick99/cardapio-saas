import type { PrismaClient } from '@prisma/client';
import type { Checkout } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { buildOrderDraft } from '../menu/pricing';
import { loadPricingProducts } from '../menu/queries';
import { createOrder } from './service';

/** Carrinho → preços do banco → pedido + job de impressão → envio ao agente. */
export async function placeOrder(prisma: PrismaClient, hub: AgentHub, restaurantId: string, checkout: Checkout) {
  const products = await loadPricingProducts(
    prisma,
    restaurantId,
    checkout.items.map((i) => i.productId),
  );
  const draft = buildOrderDraft(checkout, products);
  const { order, job } = await createOrder(prisma, restaurantId, draft);
  const sent = await hub.dispatch(job.id);
  return { order, job, sent };
}
