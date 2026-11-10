import type { Prisma, PrismaClient } from '@prisma/client';
import type { PublicMenu } from '@cardapio/shared';
import type { PricingProduct } from './pricing';

const byPosition = [{ position: 'asc' as const }, { createdAt: 'asc' as const }];

const productInclude = {
  optionGroups: {
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.ProductInclude;

/** Cardápio completo para o painel (inclui itens desativados). */
export function loadAdminMenu(prisma: PrismaClient, restaurantId: string) {
  return prisma.category.findMany({
    where: { restaurantId },
    orderBy: byPosition,
    include: { products: { orderBy: byPosition, include: productInclude } },
  });
}

/**
 * Cardápio público: só categorias, produtos e opções ativos.
 * Produtos cujo grupo obrigatório ficou sem opções ativas são escondidos,
 * porque seria impossível pedi-los.
 */
export async function loadPublicMenu(
  prisma: PrismaClient,
  restaurant: { id: string } & PublicMenu['restaurant'],
): Promise<PublicMenu> {
  const categories = await prisma.category.findMany({
    where: { restaurantId: restaurant.id, active: true },
    orderBy: byPosition,
    include: { products: { where: { active: true }, orderBy: byPosition, include: productInclude } },
  });

  return {
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      logoUrl: restaurant.logoUrl,
      coverUrl: restaurant.coverUrl,
      acceptingOrders: restaurant.acceptingOrders,
      pickupMinutes: restaurant.pickupMinutes,
      deliveryMinutes: restaurant.deliveryMinutes,
      minOrderCents: restaurant.minOrderCents,
    },
    categories: categories
      .map((c) => ({
        id: c.id,
        name: c.name,
        products: c.products
          .map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            priceCents: p.priceCents,
            imageUrl: p.imageUrl,
            featured: p.featured,
            optionGroups: p.optionGroups.map((g) => ({
              id: g.id,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              options: g.options.filter((o) => o.active).map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents })),
            })),
          }))
          .filter((p) => p.optionGroups.every((g) => g.options.length >= g.minSelect)),
      }))
      .filter((c) => c.products.length > 0),
  };
}

/** Busca os produtos do carrinho, sempre limitados ao restaurante do pedido. */
export async function loadPricingProducts(
  prisma: PrismaClient,
  restaurantId: string,
  productIds: string[],
): Promise<Map<string, PricingProduct>> {
  const products = await prisma.product.findMany({
    where: { restaurantId, id: { in: [...new Set(productIds)] } },
    include: { ...productInclude, category: { select: { active: true } } },
  });
  return new Map(
    products.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        sector: p.sector,
        active: p.active,
        categoryActive: p.category.active,
        optionGroups: p.optionGroups,
      },
    ]),
  );
}
