import type { PrismaClient } from '@prisma/client';
import type { Checkout } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { buildOrderDraft, checkRestaurantRules } from '../menu/pricing';
import { loadPricingProducts } from '../menu/queries';
import { createOrder } from './service';
import { getOrOpenTab, normalizeTabNumber } from './tabs';

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
  // Mesa e comanda: o pedido entra na conta aberta (ou abre uma nova).
  let tabId: string | undefined;
  if ((draft.type === 'mesa' || draft.type === 'comanda') && draft.table) {
    draft.table = normalizeTabNumber(draft.table);
    tabId = await getOrOpenTab(
      prisma,
      restaurantId,
      draft.type === 'mesa' ? 'MESA' : 'COMANDA',
      draft.table,
      opts.staff?.name ?? 'Cliente (QR Code)',
    );
  }

  const { order, job } = await createOrder(prisma, restaurantId, draft, { tabId });
  const sent = await hub.dispatch(job.id);
  hub.panel.publish(restaurantId, { type: 'order_created', orderId: order.id, number: order.number });
  if (tabId) hub.panel.publish(restaurantId, { type: 'tabs_changed' });
  return { order, job, sent };
}
