import type { Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, findSessionUser, type AuthUser } from '../auth/session';
import { prisma } from '../db';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

/** Lê o token da sessão do cookie (navegador) ou do header Authorization (apps, curl, testes). */
export function sessionTokenFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return request.cookies[SESSION_COOKIE] ?? null;
}

/** preHandler: exige um usuário logado. */
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const token = sessionTokenFrom(request);
  request.user = token ? await findSessionUser(prisma, token) : null;
  if (!request.user) return reply.code(401).send({ error: 'Faça login para continuar' });
}

/**
 * Carrega o restaurante pelo slug, garantindo que o usuário logado seja membro
 * com um dos papéis permitidos.
 *
 * Quem não é membro recebe 404, e não 403: assim não dá para descobrir
 * quais restaurantes existem testando slugs.
 */
export async function loadRestaurantFor(
  request: FastifyRequest,
  reply: FastifyReply,
  slug: string,
  allowedRoles: Role[] = ['OWNER', 'STAFF'],
) {
  const user = request.user;
  if (!user) {
    await reply.code(401).send({ error: 'Faça login para continuar' });
    return null;
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, restaurant: { slug } },
    include: { restaurant: true },
  });
  if (!membership) {
    await reply.code(404).send({ error: `Restaurante "${slug}" não encontrado` });
    return null;
  }
  if (!allowedRoles.includes(membership.role)) {
    await reply.code(403).send({ error: 'Seu papel neste restaurante não permite esta ação' });
    return null;
  }
  return membership.restaurant;
}
