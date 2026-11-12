import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { hashToken } from './tokens';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
}

export async function createSession(prisma: PrismaClient, userId: string, userAgent?: string) {
  const token = `ses_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 255) },
  });
  return { token, expiresAt };
}

/** Retorna o usuário da sessão, ou null se o token não existir ou tiver expirado. */
export async function findSessionUser(prisma: PrismaClient, token: string): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, isPlatformAdmin: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function deleteSession(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
