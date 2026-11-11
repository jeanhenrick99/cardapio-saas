import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CheckoutSchema, orderTotalCents } from '@cardapio/shared';
import type { AgentHub } from '../agents/hub';
import { prisma } from '../db';
import { loadImage } from '../images/storage';
import { loadPublicMenu } from '../menu/queries';
import { placeOrder } from '../orders/checkout';

const SlugParams = z.object({ slug: z.string() });

/** Rotas do cliente final (cardápio pelo QR Code): sem login. */
export async function publicRoutes(app: FastifyInstance, { hub }: { hub: AgentHub }) {
  async function findRestaurant(slug: string) {
    return prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        coverUrl: true,
        acceptingOrders: true,
        pickupMinutes: true,
        deliveryMinutes: true,
        minOrderCents: true,
      },
    });
  }

  /** Serve uma foto enviada. Cada foto tem um ID novo, então pode ficar em cache "para sempre". */
  app.get('/images/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const image = z.string().uuid().safeParse(id).success ? await loadImage(prisma, id) : null;
    if (!image) return reply.code(404).send({ error: 'Foto não encontrada' });
    return reply
      .header('content-type', image.contentType)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(Buffer.from(image.data));
  });

  app.get('/public/restaurants/:slug/menu', async (request, reply) => {
    const { slug } = SlugParams.parse(request.params);
    const restaurant = await findRestaurant(slug);
    if (!restaurant) return reply.code(404).send({ error: 'Restaurante não encontrado' });
    return loadPublicMenu(prisma, restaurant);
  });

  app.post(
    '/public/restaurants/:slug/orders',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { slug } = SlugParams.parse(request.params);
      const restaurant = await findRestaurant(slug);
      if (!restaurant) return reply.code(404).send({ error: 'Restaurante não encontrado' });

      const checkout = CheckoutSchema.parse(request.body);
      const { order } = await placeOrder(prisma, hub, restaurant.id, checkout);
      // Para o cliente, só o necessário: nada de dados internos como o job de impressão.
      return reply.code(201).send({ number: order.number, items: order.items, totalCents: orderTotalCents(order) });
    },
  );
}
