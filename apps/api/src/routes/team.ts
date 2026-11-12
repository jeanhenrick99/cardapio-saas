import { Prisma, type Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/password';
import { generateLinkToken, hashToken } from '../auth/tokens';
import { prisma } from '../db';
import { loadMe, startSession } from './auth';
import { loadRestaurantFor, requireUser } from './common';
import { EmailSchema, PasswordSchema } from './schemas';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 24 * 60 * 60 * 1000;
const RoleSchema = z.enum(['OWNER', 'STAFF']);
const SlugParams = z.object({ slug: z.string() });
const MemberParams = SlugParams.extend({ userId: z.string().uuid() });
const TokenParams = z.object({ token: z.string().min(10).max(200) });
const publicLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

const INVALID_INVITE = 'Convite inválido, expirado ou já usado. Peça um novo link ao responsável.';
const INVALID_RESET = 'Link inválido, expirado ou já usado. Peça um novo ao responsável.';

/** Convite ainda utilizável (não aceito, não revogado, dentro do prazo). */
const usableInvite = (tokenHash: string) => ({ tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } });
const usableReset = (tokenHash: string) => ({ tokenHash, usedAt: null, expiresAt: { gt: new Date() } });

/** Cria o convite e devolve o token (mostrado uma vez só). Um convite novo para o mesmo e-mail invalida os anteriores. */
export async function createInvite(restaurantId: string, input: { name: string; email: string; role: Role; createdBy: string }) {
  const token = generateLinkToken('inv');
  const invite = await prisma.$transaction(async (tx) => {
    await tx.invite.updateMany({
      where: { restaurantId, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.invite.create({
      data: { restaurantId, ...input, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
  });
  return { invite, token };
}

/**
 * Equipe do restaurante. O dono convida por link (sem depender de e-mail),
 * muda papéis, remove acessos e gera links de redefinição de senha.
 */
export async function teamRoutes(app: FastifyInstance) {
  // ---------- Área do dono ----------
  app.register(async (owner) => {
    owner.addHook('preHandler', requireUser);

    /** O usuário só participa deste restaurante? (só então o dono pode redefinir a senha dele) */
    async function onlyHere(userId: string, restaurantId: string) {
      const others = await prisma.membership.count({ where: { userId, restaurantId: { not: restaurantId } } });
      return others === 0;
    }

    owner.get('/restaurants/:slug/team', async (request, reply) => {
      const { slug } = SlugParams.parse(request.params);
      const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
      if (!restaurant) return;
      const [members, invites] = await Promise.all([
        prisma.membership.findMany({
          where: { restaurantId: restaurant.id },
          include: { user: { select: { id: true, name: true, email: true, _count: { select: { memberships: true } } } } },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.invite.findMany({
          where: { restaurantId: restaurant.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return {
        members: members.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          since: m.createdAt,
          isYou: m.user.id === request.user!.id,
          canResetPassword: m.role === 'STAFF' && m.user._count.memberships === 1,
        })),
        invites: invites.map((i) => ({ id: i.id, name: i.name, email: i.email, role: i.role, expiresAt: i.expiresAt, createdBy: i.createdBy })),
      };
    });

    owner.post('/restaurants/:slug/invites', async (request, reply) => {
      const { slug } = SlugParams.parse(request.params);
      const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
      if (!restaurant) return;
      const body = z.object({ name: z.string().trim().min(2).max(100), email: EmailSchema, role: RoleSchema.default('STAFF') }).parse(request.body);

      const already = await prisma.membership.findFirst({ where: { restaurantId: restaurant.id, user: { email: body.email } } });
      if (already) return reply.code(409).send({ error: 'Esta pessoa já faz parte da equipe.' });

      const { invite, token } = await createInvite(restaurant.id, { ...body, createdBy: request.user!.name });
      return reply.code(201).send({ id: invite.id, name: invite.name, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, token });
    });

    owner.delete('/restaurants/:slug/invites/:id', async (request, reply) => {
      const { slug, id } = SlugParams.extend({ id: z.string().uuid() }).parse(request.params);
      const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
      if (!restaurant) return;
      const { count } = await prisma.invite.updateMany({
        where: { id, restaurantId: restaurant.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) return reply.code(404).send({ error: 'Convite não encontrado' });
      return reply.code(204).send();
    });

    /** Troca o papel. O restaurante nunca fica sem dono. */
    owner.patch('/restaurants/:slug/members/:userId', async (request, reply) => {
      const { slug, userId } = MemberParams.parse(request.params);
      const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
      if (!restaurant) return;
      const { role } = z.object({ role: RoleSchema }).parse(request.body);
      const result = await changeMembership(restaurant.id, userId, role);
      if (result === 'not_found') return reply.code(404).send({ error: 'Membro não encontrado' });
      if (result === 'last_owner') return reply.code(409).send({ error: 'O restaurante precisa de pelo menos um dono.' });
      return { userId, role };
    });

    /** Remove o acesso. Quem fica sem nenhum restaurante tem as sessões encerradas. */
    owner.delete('/restaurants/:slug/members/:userId', async (request, reply) => {
      const { slug, userId } = MemberParams.parse(request.params);
      const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
      if (!restaurant) return;
      if (userId === request.user!.id) return reply.code(409).send({ error: 'Você não pode remover o seu próprio acesso.' });
      const result = await changeMembership(restaurant.id, userId, null);
      if (result === 'not_found') return reply.code(404).send({ error: 'Membro não encontrado' });
      if (result === 'last_owner') return reply.code(409).send({ error: 'O restaurante precisa de pelo menos um dono.' });
      if ((await prisma.membership.count({ where: { userId } })) === 0) await prisma.session.deleteMany({ where: { userId } });
      return reply.code(204).send();
    });

    owner.post('/restaurants/:slug/members/:userId/password-reset', async (request, reply) => {
      const { slug, userId } = MemberParams.parse(request.params);
      const restaurant = await loadRestaurantFor(request, reply, slug, ['OWNER']);
      if (!restaurant) return;
      const member = await prisma.membership.findUnique({ where: { userId_restaurantId: { userId, restaurantId: restaurant.id } } });
      if (!member) return reply.code(404).send({ error: 'Membro não encontrado' });
      if (member.role !== 'STAFF' || !(await onlyHere(userId, restaurant.id))) {
        return reply.code(403).send({ error: 'Só dá para redefinir a senha de funcionários que participam apenas deste restaurante.' });
      }
      const token = generateLinkToken('rst');
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await prisma.$transaction([
        prisma.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
        prisma.passwordReset.create({ data: { userId, tokenHash: hashToken(token), expiresAt, createdBy: request.user!.name } }),
      ]);
      return reply.code(201).send({ token, expiresAt });
    });
  });

  // ---------- Links públicos ----------

  app.get('/invites/:token', publicLimit, async (request, reply) => {
    const { token } = TokenParams.parse(request.params);
    const invite = await prisma.invite.findFirst({ where: usableInvite(hashToken(token)), include: { restaurant: { select: { name: true } } } });
    if (!invite) return reply.code(404).send({ error: INVALID_INVITE });
    const existingUser = (await prisma.user.count({ where: { email: invite.email } })) > 0;
    return { restaurant: invite.restaurant.name, name: invite.name, email: invite.email, role: invite.role, existingUser };
  });

  /**
   * Aceita o convite. E-mail novo: cria a conta com a senha escolhida.
   * E-mail que já tem conta: pede a senha dessa conta (prova que é a mesma pessoa).
   */
  app.post('/invites/:token/accept', publicLimit, async (request, reply) => {
    const { token } = TokenParams.parse(request.params);
    const body = z.object({ name: z.string().trim().min(2).max(100).optional(), password: z.string().min(1).max(200) }).parse(request.body);
    const tokenHash = hashToken(token);
    const invite = await prisma.invite.findFirst({ where: usableInvite(tokenHash) });
    if (!invite) return reply.code(404).send({ error: INVALID_INVITE });

    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      if (!(await verifyPassword(body.password, existing.passwordHash))) return reply.code(401).send({ error: 'Senha incorreta para este e-mail.' });
    } else {
      const parsed = PasswordSchema.safeParse(body.password);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]!.message });
    }
    const passwordHash = existing ? null : await hashPassword(body.password);

    try {
      const userId = await prisma.$transaction(async (tx) => {
        // Consome o convite de forma atômica: dois cliques em "Aceitar", só um vale.
        const { count } = await tx.invite.updateMany({ where: usableInvite(tokenHash), data: { acceptedAt: new Date() } });
        if (count === 0) return null;
        const user =
          existing ?? (await tx.user.create({ data: { email: invite.email, name: body.name ?? invite.name, passwordHash: passwordHash! } }));
        await tx.membership.upsert({
          where: { userId_restaurantId: { userId: user.id, restaurantId: invite.restaurantId } },
          create: { userId: user.id, restaurantId: invite.restaurantId, role: invite.role },
          update: {},
        });
        return user.id;
      });
      if (!userId) return reply.code(404).send({ error: INVALID_INVITE });
      const session = await startSession(request, reply, userId);
      return reply.code(201).send({ user: await loadMe(userId), ...session });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: 'Este e-mail acabou de ser cadastrado. Abra o link de novo e entre com a senha.' });
      }
      throw err;
    }
  });

  app.get('/password-resets/:token', publicLimit, async (request, reply) => {
    const { token } = TokenParams.parse(request.params);
    const reset = await prisma.passwordReset.findFirst({ where: usableReset(hashToken(token)), include: { user: { select: { name: true, email: true } } } });
    if (!reset) {
      await verifyAgainstDummy('x'); // mesmo tempo de resposta para token válido e inválido
      return reply.code(404).send({ error: INVALID_RESET });
    }
    return { name: reset.user.name, email: reset.user.email };
  });

  /** Define a nova senha, encerra todas as sessões antigas e já entra com a nova. */
  app.post('/password-resets/:token', publicLimit, async (request, reply) => {
    const { token } = TokenParams.parse(request.params);
    const { password } = z.object({ password: PasswordSchema }).parse(request.body);
    const tokenHash = hashToken(token);
    const reset = await prisma.passwordReset.findFirst({ where: usableReset(tokenHash) });
    if (!reset) return reply.code(404).send({ error: INVALID_RESET });
    const passwordHash = await hashPassword(password);
    const ok = await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordReset.updateMany({ where: usableReset(tokenHash), data: { usedAt: new Date() } });
      if (count === 0) return false;
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      return true;
    });
    if (!ok) return reply.code(404).send({ error: INVALID_RESET });
    const session = await startSession(request, reply, reset.userId);
    return { user: await loadMe(reset.userId), ...session };
  });
}

/**
 * Muda o papel (ou remove, com role = null) garantindo que sempre sobre um dono.
 * A contagem de donos e a mudança acontecem com as linhas travadas: dois donos
 * rebaixando um ao outro ao mesmo tempo não deixam o restaurante sem dono.
 */
async function changeMembership(restaurantId: string, userId: string, role: Role | null) {
  return prisma.$transaction(async (tx) => {
    const owners = await tx.$queryRaw<{ userId: string }[]>`
      SELECT "userId" FROM "Membership" WHERE "restaurantId" = ${restaurantId} AND role = 'OWNER' FOR UPDATE`;
    const member = await tx.membership.findUnique({ where: { userId_restaurantId: { userId, restaurantId } } });
    if (!member) return 'not_found' as const;
    const losingOwner = member.role === 'OWNER' && role !== 'OWNER';
    if (losingOwner && owners.length <= 1) return 'last_owner' as const;
    if (role === null) await tx.membership.delete({ where: { userId_restaurantId: { userId, restaurantId } } });
    else await tx.membership.update({ where: { userId_restaurantId: { userId, restaurantId } }, data: { role } });
    return 'ok' as const;
  });
}
