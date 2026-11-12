import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password';

const MIN_PASSWORD = 12;

/**
 * Sincroniza os administradores da plataforma com PLATFORM_ADMIN_EMAIL (lista separada por vírgula):
 * quem está na lista vira administrador, quem saiu deixa de ser. Sem a variável, ninguém é.
 * A conta só é CRIADA (com PLATFORM_ADMIN_PASSWORD) se o e-mail ainda não existir; uma senha
 * já definida nunca é sobrescrita, então a variável da senha pode ser removida depois do primeiro uso.
 */
export async function syncPlatformAdmins(
  prisma: PrismaClient,
  config: { emails?: string; password?: string },
  log: (line: string) => void = console.log,
): Promise<void> {
  const emails = (config.emails ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const demoted = await prisma.user.updateMany({ where: { isPlatformAdmin: true, OR: [{ email: null }, { email: { notIn: emails } }] }, data: { isPlatformAdmin: false } });
  if (demoted.count) log(`✔ ${demoted.count} usuário(s) deixaram de ser administradores da plataforma`);

  for (const email of emails) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.isPlatformAdmin) await prisma.user.update({ where: { id: existing.id }, data: { isPlatformAdmin: true } });
      log(`✔ Administrador da plataforma: ${email}`);
      continue;
    }
    if (!config.password || config.password.length < MIN_PASSWORD) {
      log(`⚠ ${email} ainda não tem conta: defina PLATFORM_ADMIN_PASSWORD (mínimo de ${MIN_PASSWORD} caracteres) para criá-la.`);
      continue;
    }
    await prisma.user.create({
      data: { email, name: 'Administrador', passwordHash: await hashPassword(config.password), isPlatformAdmin: true },
    });
    log(`✔ Administrador da plataforma criado: ${email} (a senha é a de PLATFORM_ADMIN_PASSWORD)`);
  }
}
