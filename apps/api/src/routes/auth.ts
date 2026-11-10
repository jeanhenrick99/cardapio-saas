import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/password';
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, deleteSession } from '../auth/session';
import { prisma } from '../db';
import { isProduction } from '../env';
import { requireUser, sessionTokenFrom } from './common';
import { EmailSchema, PasswordSchema, RestaurantInputSchema } from './schemas';

const SignupBody = z.object({
  name: z.string().trim().min(2).max(100),
  email: EmailSchema,
  password: PasswordSchema,
  restaurant: RestaurantInputSchema,
});

const LoginBody = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});

async function startSession(request: FastifyRequest, reply: FastifyReply, userId: string) {
  const { token, expiresAt } = await createSession(prisma, userId, request.headers['user-agent']);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true, // inacessível ao JavaScript da página (protege contra XSS)
    sameSite: 'lax', // não é enviado em requisições de outros sites (protege contra CSRF)
    secure: isProduction, // só por HTTPS em produção
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return { token, expiresAt };
}

async function loadMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        select: { role: true, restaurant: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const { memberships, ...rest } = user;
  return { ...rest, restaurants: memberships.map((m) => ({ ...m.restaurant, role: m.role })) };
}

export async function authRoutes(app: FastifyInstance) {
  /** Cadastro do dono: cria o usuário, o primeiro restaurante e já faz login. */
  app.post('/auth/signup', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = SignupBody.parse(request.body);
    const passwordHash = await hashPassword(body.password);
    try {
      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash,
          memberships: { create: { role: 'OWNER', restaurant: { create: body.restaurant } } },
        },
      });
      const session = await startSession(request, reply, user.id);
      return reply.code(201).send({ user: await loadMe(user.id), ...session });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String(err.meta?.target ?? '');
        return reply.code(409).send({ error: target.includes('slug') ? 'Este endereço de restaurante já está em uso' : 'Este e-mail já está cadastrado' });
      }
      throw err;
    }
  });

  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = LoginBody.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const valid = user ? await verifyPassword(body.password, user.passwordHash) : await verifyAgainstDummy(body.password);
    // Mesma mensagem para e-mail inexistente e senha errada.
    if (!user || !valid) return reply.code(401).send({ error: 'E-mail ou senha incorretos' });

    const session = await startSession(request, reply, user.id);
    return { user: await loadMe(user.id), ...session };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = sessionTokenFrom(request);
    if (token) await deleteSession(prisma, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/auth/me', { preHandler: requireUser }, async (request) => loadMe(request.user!.id));
}
