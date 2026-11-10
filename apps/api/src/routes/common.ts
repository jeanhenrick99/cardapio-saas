import type { FastifyReply, FastifyRequest } from 'fastify';
import { safeEqual } from '../auth/tokens';
import { env } from '../env';
import { prisma } from '../db';

/** Protege rotas administrativas até existir login de usuários no painel. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, env.ADMIN_TOKEN)) {
    return reply.code(401).send({ error: 'Não autorizado' });
  }
}

export async function findRestaurantOr404(slug: string, reply: FastifyReply) {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug } });
  if (!restaurant) {
    await reply.code(404).send({ error: `Restaurante "${slug}" não encontrado` });
    return null;
  }
  return restaurant;
}
