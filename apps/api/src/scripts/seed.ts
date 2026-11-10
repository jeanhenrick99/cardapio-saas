/** Cria o restaurante e o usuário de demonstração (pode rodar quantas vezes quiser). */
import { hashPassword } from '../auth/password';
import { prisma } from '../db';
import { DEMO_RESTAURANT, DEMO_USER } from './demo';

const restaurant = await prisma.restaurant.upsert({
  where: { slug: DEMO_RESTAURANT.slug },
  update: {},
  create: DEMO_RESTAURANT,
});

const user = await prisma.user.upsert({
  where: { email: DEMO_USER.email },
  update: {},
  create: { name: DEMO_USER.name, email: DEMO_USER.email, passwordHash: await hashPassword(DEMO_USER.password) },
});

await prisma.membership.upsert({
  where: { userId_restaurantId: { userId: user.id, restaurantId: restaurant.id } },
  update: {},
  create: { userId: user.id, restaurantId: restaurant.id, role: 'OWNER' },
});

console.log(`✔ Restaurante "${restaurant.name}" (slug: ${restaurant.slug})`);
console.log(`✔ Usuário ${DEMO_USER.email} / senha ${DEMO_USER.password} (dono do restaurante)`);
await prisma.$disconnect();
